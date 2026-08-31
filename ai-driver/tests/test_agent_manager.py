import json
import unittest
from unittest.mock import patch

from backend.agent_manager import AgentManager
from backend.model_availability import get_model_availability


class FailingAgentFactory:
    def create_queue(self, model_type):
        raise RuntimeError("test provider unavailable")


class StaticAgent:
    def __init__(self, response):
        self.response = response

    def execute(self, _prompt, _input_data):
        return json.dumps(self.response, ensure_ascii=False)


class StaticAgentFactory:
    def __init__(self, official_course):
        self.official_course = official_course

    def create_queue(self, _model_type):
        return [
            StaticAgent({"competency_gaps": []}),
            StaticAgent({"stages": []}),
            StaticAgent({
                "summary": "Тестовый ответ модели",
                "stages": [{
                    "stage_number": 1,
                    "stage_title": "Тестовый этап",
                    "courses": [
                        {
                            "course_id": self.official_course["id"],
                            "course_name": self.official_course["name"] + " (опечатка модели)",
                            "justification": "Обоснование, переданное тестовой моделью.",
                        },
                        {
                            "course_name": "Несуществующий курс модели",
                            "justification": "Курс отсутствует в официальном каталоге.",
                        },
                    ],
                }],
            }),
        ]


class RecordingAgent(StaticAgent):
    def __init__(self, response, inputs):
        super().__init__(response)
        self.inputs = inputs

    def execute(self, prompt, input_data):
        self.inputs.append(input_data)
        return super().execute(prompt, input_data)


class RecordingAgentFactory:
    def __init__(self):
        self.inputs = []

    def create_queue(self, _model_type):
        return [
            RecordingAgent({"competency_gaps": []}, self.inputs),
            RecordingAgent({"stages": []}, self.inputs),
            RecordingAgent({"summary": "", "stages": []}, self.inputs),
        ]


class FirstAgentFailsFactory:
    def __init__(self, official_course):
        self.calls = [0, 0, 0]
        self.official_course = official_course

    def create_queue(self, _model_type):
        factory = self

        class Agent:
            def __init__(self, index):
                self.index = index

            def execute(self, _prompt, _input_data):
                factory.calls[self.index] += 1
                if self.index == 0:
                    raise RuntimeError("invalid first agent output")
                if self.index == 1:
                    return json.dumps({"stages": [{"courses": [{"course_name": factory.official_course["name"]}]}]})
                return json.dumps({
                    "stages": [{"courses": [{"course_name": factory.official_course["name"]}]}],
                    "competency_radar": [],
                })

        return [Agent(0), Agent(1), Agent(2)]


class AgentManagerFallbackTests(unittest.TestCase):
    def setUp(self):
        self.manager = AgentManager(FailingAgentFactory())

    @patch("backend.model_availability.local_llm_ready", return_value=False)
    @patch.dict("os.environ", {"DEEPSEEK_API_KEY": "", "SBERGPT_API_KEY": ""}, clear=False)
    def test_model_availability_does_not_claim_missing_providers(self, _qwen_ready):
        response = get_model_availability()
        availability = {item["id"]: item for item in response["models"]}

        self.assertFalse(availability["deepseek"]["configured"])
        self.assertFalse(availability["sbergpt"]["configured"])
        self.assertFalse(availability["local_llm"]["configured"])
        self.assertFalse(response["generation_available"])
        self.assertEqual(response["operating_mode"], "no-ai")

    @patch("backend.model_availability.local_llm_ready", return_value=True)
    @patch.dict(
        "os.environ",
        {"DEEPSEEK_API_KEY": "configured", "SBERGPT_API_KEY": "configured"},
        clear=False,
    )
    def test_model_availability_reports_configured_providers(self, _qwen_ready):
        response = get_model_availability()
        availability = {item["id"]: item for item in response["models"]}

        self.assertTrue(all(item["configured"] for item in availability.values()))
        self.assertTrue(response["generation_available"])
        self.assertEqual(response["operating_mode"], "ai-enabled")

    @patch("backend.model_availability.local_llm_ready", return_value=True)
    @patch.dict(
        "os.environ",
        {
            "LOCAL_LLM_MODE": "managed",
            "LOCAL_LLM_MODEL": "local-model",
            "LOCAL_LLM_MODEL_FILE": "Qwen3-1.7B-Q4_K_M.gguf",
        },
        clear=False,
    )
    def test_local_model_reports_actual_gguf_file(self, _qwen_ready):
        availability = {item["id"]: item for item in get_model_availability()["models"]}

        self.assertEqual(availability["local_llm"]["model"], "Qwen3-1.7B-Q4_K_M.gguf")
        metadata = self.manager._generation_metadata("local_llm", "validated")
        self.assertEqual(metadata["model_version"], "Qwen3-1.7B-Q4_K_M.gguf")

    def test_fallback_is_degraded_and_excludes_completed_courses(self):
        completed_course = self.manager.catalog[0]["name"]
        payload = json.dumps(
            {
                "request_id": "test-request",
                "model_type": "deepseek",
                "employee": {
                    "fio": "Тестовый профиль",
                    "position": "Главный специалист",
                    "department": "Тестовое ведомство",
                    "career_goal": "Профессиональное развитие",
                    "learning_history": [
                        {"course_name": completed_course, "status": "Пройден"}
                    ],
                },
            },
            ensure_ascii=False,
        )

        result = json.loads(self.manager.start_deepseek_processing(payload))

        self.assertEqual(result["generation_mode"], "fallback")
        self.assertEqual(result["quality_status"], "degraded")
        self.assertTrue(result["model_version"])
        self.assertTrue(result["prompt_version"])
        self.assertTrue(result["catalog_version"].startswith("2025:"))
        self.assertEqual(result["validation_version"], "trajectory-validation-v1")
        self.assertEqual(result["trajectory"]["competency_radar"], [])
        self.assertTrue(result["trajectory"]["limitations"])
        self.assertEqual(len(result["trajectory"]["stages"]), 1)
        self.assertEqual(result["trajectory"]["stages"][0]["recommended_period"], "")
        self.assertEqual(result["trajectory"]["stages"][0]["stage_goal"], "")
        self.assertTrue(all(
            course["justification"] == ""
            for stage in result["trajectory"]["stages"]
            for course in stage["courses"]
        ))

        recommended = {
            course["course_name"]
            for stage in result["trajectory"]["stages"]
            for course in stage["courses"]
        }
        self.assertNotIn(completed_course, recommended)
        catalog_names = {course["name"] for course in self.manager.catalog}
        self.assertTrue(recommended.issubset(catalog_names))
        self.assertTrue(all(
            course["evidence_sources"]
            for stage in result["trajectory"]["stages"]
            for course in stage["courses"]
        ))
        progress = self.manager.get_progress("test-request")
        self.assertEqual(progress["stage"], "completed")
        self.assertEqual(progress["percent"], 100)

    def test_llm_course_outside_catalog_is_rejected(self):
        source_manager = AgentManager(FailingAgentFactory())
        official_course = source_manager.catalog[0]
        manager = AgentManager(StaticAgentFactory(official_course))
        payload = json.dumps({
            "request_id": "catalog-validation",
            "model_type": "deepseek",
            "employee": {
                "fio": "Тестовый профиль",
                "position": "Главный специалист",
                "department": "Тестовое ведомство",
                "career_goal": official_course["name"],
                "learning_history": [],
            },
        }, ensure_ascii=False)

        result = json.loads(manager.start_deepseek_processing(payload))
        courses = result["trajectory"]["stages"][0]["courses"]

        self.assertEqual(result["quality_status"], "degraded")
        self.assertEqual([course["course_name"] for course in courses], [official_course["name"]])
        self.assertTrue(any("отклонен" in item for item in result["trajectory"]["limitations"]))
        self.assertTrue(courses[0]["evidence_sources"])
        self.assertNotIn("Тестовый ответ модели", result["trajectory"]["summary"])
        self.assertNotIn("Бенчмарк коллег отсутствует", courses[0]["evidence_sources"])

    @patch("backend.agent_manager.local_llm_ready", return_value=True)
    def test_later_agents_still_run_when_first_agent_response_is_rejected(self, _qwen_ready):
        official_course = self.manager.catalog[0]
        factory = FirstAgentFailsFactory(official_course)
        manager = AgentManager(factory)
        payload = json.dumps({
            "request_id": "partial-agent-failure",
            "model_type": "local_llm",
            "employee": {
                "fio": "Тестовый профиль",
                "position": "Главный специалист",
                "department": "Тестовое ведомство",
                "career_goal": official_course["name"],
                "learning_history": [],
            },
        }, ensure_ascii=False)

        result = json.loads(manager.start_local_llm_processing(payload))

        self.assertEqual(factory.calls, [1, 1, 1])
        self.assertEqual(result["quality_status"], "degraded")
        self.assertEqual(
            result["trajectory"]["stages"][0]["courses"][0]["course_name"],
            official_course["name"],
        )

    @patch("backend.agent_manager.time.sleep")
    @patch("backend.agent_manager.local_llm_ready", side_effect=[False, True])
    def test_local_pipeline_waits_for_model_readiness(self, qwen_ready, sleep_mock):
        self.assertTrue(self.manager._wait_for_local_model())
        self.assertEqual(qwen_ready.call_count, 2)
        sleep_mock.assert_called_once()

    @patch.object(AgentManager, "_wait_for_local_model", return_value=True)
    def test_local_transport_failure_retries_only_unfinished_agent(self, _wait_ready):
        class APIConnectionError(Exception):
            pass

        class TransientAgent:
            specialization = "trajectory-justifier"

            def __init__(self):
                self.calls = 0

            def execute(self, _system_prompt, _input_data):
                self.calls += 1
                if self.calls == 1:
                    try:
                        raise APIConnectionError("model restarted")
                    except APIConnectionError as cause:
                        raise RuntimeError("wrapped") from cause
                return '{"stages": []}'

        agent = TransientAgent()
        result = self.manager._execute_agent_with_recovery(
            agent, "system", "{}", "local_llm"
        )

        self.assertEqual(result, '{"stages": []}')
        self.assertEqual(agent.calls, 2)

    def test_catalog_course_without_grounded_link_is_rejected(self):
        official_course = self.manager.catalog[0]
        manager = AgentManager(StaticAgentFactory(official_course))
        payload = json.dumps({
            "request_id": "unsupported-link",
            "model_type": "deepseek",
            "employee": {
                "fio": "Тестовый профиль",
                "position": "Главный специалист",
                "department": "Тестовое ведомство",
                "career_goal": "Ксенобиология межзвездных организмов",
                "learning_history": [],
            },
        }, ensure_ascii=False)

        result = json.loads(manager.start_deepseek_processing(payload))
        courses = result["trajectory"]["stages"][0]["courses"]

        self.assertEqual(courses, [])
        self.assertEqual(result["quality_status"], "degraded")
        self.assertTrue(any("проверяемая связь" in item for item in result["trajectory"]["limitations"]))

    def test_goal_matching_ignores_generic_government_context(self):
        exact = next(
            course for course in self.manager.catalog
            if course["name"] == "Проектное управление в органах государственной власти"
        )
        social = next(
            course for course in self.manager.catalog
            if course["name"] == "Социальные сети в органах государственной власти"
        )
        modern = next(
            course for course in self.manager.catalog
            if course["name"] == "Современные методологии проектного управления"
        )
        goal = "Проектное управление в органах государственной власти"

        self.assertTrue(self.manager._course_matches_goal(exact, goal))
        self.assertTrue(self.manager._course_matches_goal(modern, goal))
        self.assertFalse(self.manager._course_matches_goal(social, goal))
        self.assertFalse(
            self.manager._course_matches_goal(exact, "Ксенобиология межзвездных организмов")
        )
        self.assertEqual(
            [
                course["name"]
                for course in self.manager.catalog
                if self.manager._course_matches_goal(
                    course, "Ксенобиология межзвездных организмов"
                )
            ],
            [],
        )

    def test_external_model_payload_uses_pseudonym_instead_of_fio(self):
        factory = RecordingAgentFactory()
        manager = AgentManager(factory)
        real_fio = "Иванов Иван Иванович"
        payload = json.dumps({
            "request_id": "pii-test",
            "model_type": "deepseek",
            "employee": {
                "fio": real_fio,
                "position": "Главный специалист",
                "department": "Тестовое ведомство",
                "career_goal": f"Развитие {real_fio}, связь ivanov@example.org и +7 921 123-45-67",
                "learning_history": [{"course_name": f"Вводный курс для {real_fio}", "status": "Пройден"}],
            },
        }, ensure_ascii=False)

        manager.start_deepseek_processing(payload)

        self.assertEqual(len(factory.inputs), 3)
        self.assertTrue(all(real_fio not in agent_input for agent_input in factory.inputs))
        self.assertTrue(all("ГГС_ID_" in agent_input for agent_input in factory.inputs))
        self.assertTrue(all("ivanov@example.org" not in agent_input for agent_input in factory.inputs))
        self.assertTrue(all("+7 921 123-45-67" not in agent_input for agent_input in factory.inputs))

    @patch("backend.agent_manager.local_llm_ready", return_value=True)
    @patch.dict("os.environ", {"LOCAL_LLM_MODE": "external"}, clear=False)
    def test_external_local_endpoint_is_not_treated_as_trusted_pii_boundary(self, _ready):
        factory = RecordingAgentFactory()
        manager = AgentManager(factory)
        real_fio = "Петров Пётр Петрович"
        payload = json.dumps({
            "request_id": "external-local-pii-test",
            "model_type": "local_llm",
            "employee": {
                "fio": real_fio,
                "position": "Главный специалист",
                "department": "Тестовое ведомство",
                "career_goal": f"Развитие {real_fio}, petrov@example.org",
                "learning_history": [],
            },
        }, ensure_ascii=False)

        manager.start_local_llm_processing(payload)

        self.assertEqual(len(factory.inputs), 3)
        self.assertTrue(all(real_fio not in agent_input for agent_input in factory.inputs))
        self.assertTrue(all("ГГС_ID_" in agent_input for agent_input in factory.inputs))
        self.assertTrue(all("petrov@example.org" not in agent_input for agent_input in factory.inputs))

    def test_public_benchmarks_never_include_employee_profiles(self):
        public_benchmarks = self.manager.get_public_benchmarks()

        self.assertNotIn("users", public_benchmarks)
        self.assertEqual(
            set(public_benchmarks),
            {"total_records", "benchmarks_by_position", "benchmarks_by_position_and_dept"},
        )
        self.assertEqual(len(public_benchmarks["benchmarks_by_position"]), 36)
        self.assertEqual(len(public_benchmarks["benchmarks_by_position_and_dept"]), 242)

    @patch.dict("os.environ", {"AI_CATALOG_CANDIDATE_LIMIT": "10"}, clear=False)
    def test_llm_catalog_context_is_bounded_and_uses_exact_catalog_facts(self):
        compact = self.manager._compact_catalog_candidates(self.manager.catalog)

        self.assertEqual(len(compact), 10)
        self.assertTrue(all(len(item["annotation"]) <= 320 for item in compact))
        self.assertTrue(all(len(item["target"]) <= 240 for item in compact))
        self.assertTrue(all("results" not in item for item in compact))
        self.assertEqual(compact[0]["id"], self.manager.catalog[0]["id"])
        self.assertEqual(compact[0]["name"], self.manager.catalog[0]["name"])


if __name__ == "__main__":
    unittest.main()
