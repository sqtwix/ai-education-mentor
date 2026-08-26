import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.agent_client import AgentClient


class AgentClientJsonTests(unittest.TestCase):
    @patch("backend.agent_client.OpenAI")
    def test_local_qwen_disables_thinking_and_sdk_retries(self, openai_mock):
        api = MagicMock()
        api.chat.completions.create.return_value = SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content='{"status":"ok"}'))]
        )
        openai_mock.return_value = api

        client = AgentClient(
            api_key="not-needed",
            base_url="http://qwen-local:8080/v1",
            agent_model="local-model",
            specialization="competency-analyst",
        )
        result = client.execute("Return JSON.", "{}")

        self.assertEqual(result, '{"status": "ok"}')
        self.assertEqual(openai_mock.call_args.kwargs["max_retries"], 0)
        sent_messages = api.chat.completions.create.call_args.kwargs["messages"]
        self.assertTrue(sent_messages[0]["content"].endswith("/no_think"))

    def test_valid_json_object_is_preserved(self):
        self.assertEqual(
            AgentClient._parse_json_object('{"stages": [], "limitations": []}'),
            {"stages": [], "limitations": []},
        )

    def test_only_missing_closing_delimiters_are_repaired(self):
        self.assertEqual(
            AgentClient._parse_json_object('{"stages":[{"courses":[]}'),
            {"stages": [{"courses": []}]},
        )

    def test_markdown_wrapper_is_ignored_without_changing_values(self):
        self.assertEqual(
            AgentClient._parse_json_object('```json\n{"value":"точный текст"}\n```'),
            {"value": "точный текст"},
        )

    def test_mismatched_or_unterminated_content_is_rejected(self):
        with self.assertRaises(ValueError):
            AgentClient._parse_json_object('{"stages":]}')
        with self.assertRaises(ValueError):
            AgentClient._parse_json_object('{"value":"оборвано}')


if __name__ == "__main__":
    unittest.main()
