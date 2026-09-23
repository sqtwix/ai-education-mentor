from __future__ import annotations

import json
import logging
import hashlib
import hmac
import os
import re
import secrets
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional, Set, Tuple, TYPE_CHECKING

from backend.model_availability import local_llm_mode, local_llm_ready

if TYPE_CHECKING:
    from backend.agent_factory import AgentFactory

BASE_DIR = Path(__file__).resolve().parent
PATH_TO_JSON = BASE_DIR / "system_prompts.json"
DATA_DIR = BASE_DIR / "data"

logger = logging.getLogger(__name__)

class AgentManager:
    MAX_RECOMMENDED_COURSES = 3
    _COMPLETED_STATUSES = frozenset({
        "пройден", "завершен", "завершён", "успешно", "passed", "completed", "done",
    })
    _PENDING_STATUSES = frozenset({
        "не пройден", "не завершен", "не завершён", "назначен", "назначено", "в процессе",
        "not passed", "not completed", "failed", "incomplete", "pending", "in progress",
    })

    def __init__(self, agent_factory: AgentFactory):
        try:
            self.agent_factory = agent_factory
            self._pseudonym_key = secrets.token_bytes(32)
            self._progress_lock = threading.Lock()
            self._progress_by_request: Dict[str, Dict[str, Any]] = {}
            min_cohort_raw = os.getenv("MIN_COHORT_SIZE", "").strip()
            self.min_cohort_size = int(min_cohort_raw) if min_cohort_raw.isdigit() and int(min_cohort_raw) >= 2 else None
            with open(PATH_TO_JSON, "r", encoding="utf-8") as f:
                self.system_prompts = json.load(f)
            self.prompt_version = hashlib.sha256(json.dumps(
                self.system_prompts,
                ensure_ascii=False,
                sort_keys=True,
            ).encode("utf-8")).hexdigest()[:16]

            # Загружаем реальный каталог курсов и датасет истории
            self.catalog_path = DATA_DIR / "courses_catalog.json"
            self.history_path = DATA_DIR / "learning_history_dataset.json"
            
            self.catalog = []
            if self.catalog_path.exists():
                with open(self.catalog_path, "r", encoding="utf-8") as f:
                    self.catalog = json.load(f)
            self.catalog_version = hashlib.sha256(json.dumps(
                self.catalog,
                ensure_ascii=False,
                sort_keys=True,
            ).encode("utf-8")).hexdigest()[:16]
            
            self.history_dataset = {"users": [], "benchmarks_by_position": {}, "benchmarks_by_position_and_dept": {}}
            if self.history_path.exists():
                with open(self.history_path, "r", encoding="utf-8") as f:
                    self.history_dataset = json.load(f)
                    
            logger.info("AgentManager initialized with %d catalog courses and %d position benchmarks", 
                        len(self.catalog), len(self.history_dataset.get("benchmarks_by_position", {})))
        except Exception as e:
            raise Exception("Agent Manager Initialization Error: " + str(e))

    def start_deepseek_processing(self, input_data: str) -> str:
        return self._run_pipeline(input_data, "deepseek")

    def start_sbergpt_processing(self, input_data: str) -> str:
        return self._run_pipeline(input_data, "sbergpt")

    def start_local_llm_processing(self, input_data: str) -> str:
        return self._run_pipeline(input_data, "local_llm")

    def start_qwen_local_processing(self, input_data: str) -> str:
        """Backward-compatible entrypoint for tasks created before local_llm."""
        return self.start_local_llm_processing(input_data)

    @staticmethod
    def _is_local_model(model_type: str) -> bool:
        return model_type in {"local_llm", "qwen_local", "qwen", "local"}

    @classmethod
    def _classify_learning_history(cls, learning_history: Any) -> Dict[str, Any]:
        """Normalize history once and never infer a pending course from an unknown status."""
        rows = learning_history if isinstance(learning_history, list) else []
        deduplicated_history: List[Dict[str, Any]] = []
        seen_rows: Set[Tuple[str, str, str]] = set()
        completed_display: Dict[str, str] = {}
        pending_display: Dict[str, str] = {}
        unknown_statuses: List[Dict[str, str]] = []
        duplicate_count = 0

        for raw_item in rows:
            if not isinstance(raw_item, dict):
                continue
            course_name = re.sub(r"\s+", " ", str(raw_item.get("course_name", "")).strip())
            course_type = re.sub(r"\s+", " ", str(raw_item.get("course_type", "")).strip())
            status = re.sub(r"\s+", " ", str(raw_item.get("status", "")).strip())
            if not course_name:
                continue

            row_key = (course_name.casefold(), course_type.casefold(), status.casefold())
            if row_key in seen_rows:
                duplicate_count += 1
            else:
                seen_rows.add(row_key)
                deduplicated_history.append({
                    "course_name": course_name,
                    "course_type": course_type,
                    "status": status,
                })

            course_key = course_name.casefold()
            status_key = status.casefold()
            if status_key in cls._COMPLETED_STATUSES:
                completed_display.setdefault(course_key, course_name)
            elif status_key in cls._PENDING_STATUSES:
                pending_display.setdefault(course_key, course_name)
            elif not any(
                item["course_name"].casefold() == course_key and item["status"].casefold() == status_key
                for item in unknown_statuses
            ):
                unknown_statuses.append({"course_name": course_name, "status": status})

        conflicting_names = set(completed_display) & set(pending_display)
        return {
            "deduplicated_history": deduplicated_history,
            "completed_names": set(completed_display),
            "pending_names": set(pending_display) - set(completed_display),
            "completed_display": completed_display,
            "pending_display": pending_display,
            "conflicting_names": conflicting_names,
            "unknown_statuses": unknown_statuses,
            "duplicate_count": duplicate_count,
        }

    @staticmethod
    def _wait_for_local_model() -> bool:
        raw_timeout = os.getenv("AI_MODEL_READINESS_TIMEOUT_SECONDS", "180").strip()
        timeout_seconds = int(raw_timeout) if raw_timeout.isdigit() else 180
        timeout_seconds = max(5, min(timeout_seconds, 600))
        raw_poll = os.getenv("AI_MODEL_READINESS_POLL_SECONDS", "2").strip()
        poll_seconds = int(raw_poll) if raw_poll.isdigit() else 2
        poll_seconds = max(1, min(poll_seconds, 10))
        deadline = time.monotonic() + timeout_seconds
        while True:
            if local_llm_ready():
                return True
            if time.monotonic() >= deadline:
                return False
            time.sleep(poll_seconds)

    @staticmethod
    def _is_model_transport_failure(exception: Exception) -> bool:
        transport_errors = {
            "APIConnectionError", "APITimeoutError", "InternalServerError",
            "ConnectError", "ConnectTimeout", "ReadTimeout",
        }
        current: Optional[BaseException] = exception
        visited = set()
        while current is not None and id(current) not in visited:
            visited.add(id(current))
            if type(current).__name__ in transport_errors:
                return True
            current = current.__cause__ or current.__context__
        return False

    def _execute_agent_with_recovery(
        self,
        agent: Any,
        system_prompt: str,
        input_data: str,
        model_type: str,
    ) -> str:
        try:
            return agent.execute(system_prompt, input_data)
        except Exception as exception:
            if (
                self._is_local_model(model_type)
                and self._is_model_transport_failure(exception)
                and self._wait_for_local_model()
            ):
                logger.warning(
                    "Local model transport interrupted; retrying only the unfinished %s agent",
                    getattr(agent, "specialization", "unknown"),
                )
                return agent.execute(system_prompt, input_data)
            raise

    def get_public_benchmarks(self) -> Dict[str, Any]:
        """Return aggregate benchmark data without employee profiles."""
        return {
            "total_records": self.history_dataset.get("total_records", 0),
            "benchmarks_by_position": self.history_dataset.get("benchmarks_by_position", {}),
            "benchmarks_by_position_and_dept": self.history_dataset.get("benchmarks_by_position_and_dept", {}),
        }

    def get_progress(self, request_id: str) -> Dict[str, Any]:
        with self._progress_lock:
            progress = self._progress_by_request.get(request_id)
            return dict(progress) if progress else {
                "request_id": request_id,
                "stage": "unknown",
                "message": "Текущий этап пока не зарегистрирован.",
                "percent": 0,
            }

    def _set_progress(self, request_id: str, stage: str, message: str, percent: int) -> None:
        if not request_id:
            return
        with self._progress_lock:
            if len(self._progress_by_request) >= 1000 and request_id not in self._progress_by_request:
                self._progress_by_request.pop(next(iter(self._progress_by_request)))
            self._progress_by_request[request_id] = {
                "request_id": request_id,
                "stage": stage,
                "message": message,
                "percent": max(0, min(100, percent)),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }

    def _generation_metadata(
        self,
        model_type: str,
        quality_status: str,
        generation_mode: str = "llm",
    ) -> Dict[str, Any]:
        model_env = {
            "deepseek": "DEEPSEEK_MODEL",
            "sbergpt": "SBERGPT_MODEL",
            "local_llm": "LOCAL_LLM_MODEL",
            "qwen_local": "LOCAL_LLM_MODEL",
        }
        default_model = {
            "deepseek": "deepseek-chat",
            "sbergpt": "GigaChat-Pro",
            "local_llm": "local-model",
            "qwen_local": "local-model",
        }
        model_version = os.getenv(model_env.get(model_type, ""), default_model.get(model_type, model_type))
        if self._is_local_model(model_type) and local_llm_mode() == "managed":
            model_version = (
                os.getenv("LOCAL_LLM_MODEL_FILE")
                or os.getenv("QWEN_MODEL_FILE")
                or model_version
            ).strip()
        return {
            "generation_mode": generation_mode,
            "quality_status": quality_status,
            "model_version": model_version,
            "prompt_version": self.prompt_version,
            "catalog_version": f"2025:{self.catalog_version}",
            "validation_version": "trajectory-validation-v1",
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    def _pseudonymize_fio(self, fio: str) -> str:
        """Псевдонимизация ФИО перед отправкой во внешние облачные модели"""
        if not fio or fio == "Служащий":
            return "Служащий_ID_1"
        digest = hmac.new(self._pseudonym_key, fio.encode("utf-8"), hashlib.sha256).hexdigest()
        return f"ГГС_ID_{digest[:12].upper()}"

    @staticmethod
    def _mask_external_text(value: Any, real_fio: str, pseudonym: str) -> str:
        text = str(value or "")
        if real_fio:
            text = re.sub(re.escape(real_fio), pseudonym, text, flags=re.IGNORECASE)
        text = re.sub(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b", "user_***@***", text)
        text = re.sub(r"(?:\+7|8)[\s-]*\(?\d{3}\)?[\s-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}", "+7 (***) ***-**-**", text)
        text = re.sub(r"\b\d{3}-\d{3}-\d{3}\s\d{2}\b", "***-***-*** **", text)
        text = re.sub(r"\b\d{4}\s\d{6}\b", "**** ******", text)
        return text

    def _find_cohort_benchmark(self, position: str, department: str) -> Dict[str, Any]:
        """
        Поиск бенчмарка по когорте (должность + ИОГВ) с иерархическим fallback:
        1. Точная пара 'должность + ИОГВ'
        2. Должность по всему городу (если в данном ИОГВ мало коллег)
        3. Базовый профиль с явной отметкой об ограничении выборки
        """
        benchmarks_pos_dept = self.history_dataset.get("benchmarks_by_position_and_dept", {})
        benchmarks_pos = self.history_dataset.get("benchmarks_by_position", {})
        
        pos_clean = position.strip()
        dept_clean = department.strip()
        pos_dept_key = f"{pos_clean}___{dept_clean}"

        if self.min_cohort_size is None:
            return {
                "total_employees": 0,
                "courses": {},
                "is_cohort_limited": True,
                "cohort_type": "none",
                "cohort_note": "Минимальный размер когорты не настроен; статистический бенчмарк отключен"
            }

        exact_pair = next(
            (value for key, value in benchmarks_pos_dept.items() if key.casefold() == pos_dept_key.casefold()),
            None
        )
        
        # 1. Точное совпадение по паре Должность + ИОГВ
        if exact_pair is not None:
            cohort_data = exact_pair
            if cohort_data.get("total_employees", 0) >= self.min_cohort_size:
                return {
                    "total_employees": cohort_data["total_employees"],
                    "courses": cohort_data.get("courses", {}),
                    "is_cohort_limited": False,
                    "cohort_type": "position_and_department",
                    "cohort_note": f"Статистика по {cohort_data['total_employees']} коллегам в должности «{pos_clean}» в ведомстве «{dept_clean}»"
                }
        
        # 2. Совпадение по должности (общегородской срез)
        exact_position = next(
            (value for key, value in benchmarks_pos.items() if key.casefold() == pos_clean.casefold()),
            None
        )
        if exact_position is not None and exact_position.get("total_employees", 0) >= self.min_cohort_size:
            pos_data = exact_position
            return {
                "total_employees": pos_data["total_employees"],
                "courses": pos_data.get("courses", {}),
                "is_cohort_limited": True,
                "cohort_type": "position_wide",
                "cohort_note": f"Использован общегородской срез по должности «{pos_clean}» ({pos_data['total_employees']} коллег в реестре)"
            }
            
        # 3. Данных недостаточно
        return {
            "total_employees": 0,
            "courses": {},
            "is_cohort_limited": True,
            "cohort_type": "none",
            "cohort_note": "Недостаточно данных по аналогичным коллегам в реестре обучения для формирования статистического бенчмарка"
        }

    def _rank_catalog_candidates(
        self, 
        available_catalog: List[Dict[str, Any]], 
        career_goal: str, 
        position: str, 
        department: str,
        popular_courses: Dict[str, Any],
        pending_course_names: Optional[Set[str]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Детерминированное ранжирование всего доступного каталога:
        - Лексическое совпадение с указанной пользователем целью развития
        - Востребованность среди коллег (популярность)
        """
        goal_roots = self._significant_roots(career_goal)
        normalized_goal = self._normalized_words(career_goal)
        popular_by_name = {name.casefold(): value for name, value in popular_courses.items()}
        pending_names = {name.casefold() for name in (pending_course_names or set())}
        
        def score_course(item: Dict[str, Any]) -> float:
            score = 0.0
            name = item.get("name", "")
            corpus = f"{name} {item.get('annotation', '')} {item.get('target', '')} {' '.join(item.get('competencies', []))} {item.get('results', '')}"
            name_roots = self._significant_roots(name)
            corpus_roots = self._significant_roots(corpus)
            
            # 1. Соответствие целям и ключевым словам
            score += len(goal_roots & corpus_roots) * 15.0
            score += len(goal_roots & name_roots) * 30.0
            if normalized_goal and self._normalized_words(name) == normalized_goal:
                score += 200.0
                    
            # 2. Бонус популярности коллег
            if name.casefold() in popular_by_name:
                pop_info = popular_by_name[name.casefold()]
                popularity = pop_info.get("popularity_pct")
                success_rate = pop_info.get("success_rate")
                score += (popularity if isinstance(popularity, (int, float)) else 0) * 0.8
                score += ((success_rate if isinstance(success_rate, (int, float)) else 50) - 50) * 0.2

            # «Не пройден» в исходной истории — прямое подтверждение того,
            # что программа уже была назначена/выбрана для сотрудника. Такой
            # сигнал допустим и при отсутствии отдельной карьерной цели.
            if name.casefold() in pending_names:
                score += 500.0
                
            return score

        sorted_courses = sorted(available_catalog, key=score_course, reverse=True)
        return sorted_courses

    @staticmethod
    def _compact_catalog_candidates(ranked_catalog: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Keep the LLM prompt bounded while preserving exact catalog facts."""
        raw_limit = os.getenv("AI_CATALOG_CANDIDATE_LIMIT", "10").strip()
        candidate_limit = int(raw_limit) if raw_limit.isdigit() else 10
        candidate_limit = max(3, min(candidate_limit, 20))

        def bounded_text(value: Any, limit: int) -> str:
            text = re.sub(r"\s+", " ", str(value or "")).strip()
            if len(text) <= limit:
                return text
            shortened = text[:limit].rsplit(" ", 1)[0].strip()
            return shortened or text[:limit]

        return [
            {
                "id": course.get("id", ""),
                "name": course.get("name", ""),
                "type": course.get("type", ""),
                "category": course.get("category", ""),
                "hours": course.get("duration_hours", 0),
                "competencies": [str(value) for value in course.get("competencies", [])[:6]],
                "annotation": bounded_text(course.get("annotation", ""), 320),
                "target": bounded_text(course.get("target", ""), 240),
            }
            for course in ranked_catalog[:candidate_limit]
        ]

    @staticmethod
    def _validated_agent_object(raw: str, required_list_field: str) -> Dict[str, Any]:
        parsed = json.loads(raw)
        if not isinstance(parsed, dict) or not isinstance(parsed.get(required_list_field), list):
            raise ValueError(f"Agent response must contain list field {required_list_field}")
        return parsed

    @staticmethod
    def _deterministic_competency_analysis(
        career_goal: str,
        completed_course_names: Set[str],
    ) -> Dict[str, Any]:
        signals = []
        if career_goal:
            signals.append({"signal": career_goal, "source": "career_goal"})
        return {
            "observed_development_signals": signals,
            "completed_courses_excluded": sorted(completed_course_names),
            "limitations": [
                "Ответ агента анализа профиля отклонен; сохранены только факты исходного профиля."
            ],
        }

    def _deterministic_trajectory_plan(
        self,
        ranked_catalog: List[Dict[str, Any]],
        career_goal: str,
        popular_courses: Dict[str, Any],
        pending_course_names: Optional[Set[str]] = None,
    ) -> Dict[str, Any]:
        popular_names = {name.casefold() for name in popular_courses}
        pending_names = {name.casefold() for name in (pending_course_names or set())}
        supported = [
            course
            for course in ranked_catalog
            if self._course_matches_goal(course, career_goal)
            or str(course.get("name", "")).casefold() in popular_names
            or str(course.get("name", "")).casefold() in pending_names
        ][:self.MAX_RECOMMENDED_COURSES]
        return {
            "stages": [{
                "stage_number": 1,
                "stage_title": "Кандидаты для экспертной проверки",
                "recommended_period": "",
                "stage_goal": "",
                "courses": [
                    {
                        "course_id": course.get("id", ""),
                        "course_name": course.get("name", ""),
                    }
                    for course in supported
                ],
            }],
            "limitations": [
                "Ответ агента проектирования отклонен; кандидаты выбраны детерминированно по заявленной цели и доступному когортному срезу."
            ],
        }

    def _sanitize_architect_plan(
        self,
        plan: Dict[str, Any],
        catalog_candidates: List[Dict[str, Any]],
        career_goal: str,
        popular_courses: Dict[str, Any],
        pending_course_names: Optional[Set[str]] = None,
    ) -> tuple[Dict[str, Any], bool]:
        """Bound the intermediate plan to grounded, relevant catalog candidates."""
        by_id = {
            str(item.get("id", "")).casefold(): item
            for item in catalog_candidates
            if item.get("id")
        }
        by_name = {
            str(item.get("name", "")).casefold(): item
            for item in catalog_candidates
            if item.get("name")
        }
        popular_names = {str(name).casefold() for name in popular_courses}
        pending_names = {name.casefold() for name in (pending_course_names or set())}
        raw_courses = [
            course
            for stage in plan.get("stages", [])
            if isinstance(stage, dict)
            for course in stage.get("courses", [])
            if isinstance(course, dict)
        ]
        accepted = []
        seen_ids = set()
        for course in raw_courses:
            course_id = str(course.get("course_id", "")).strip().casefold()
            course_name = str(course.get("course_name", "")).strip().casefold()
            item = by_id.get(course_id) if course_id else None
            if item is None and course_name:
                item = by_name.get(course_name)
            if item is None:
                continue
            canonical_id = str(item.get("id", "")).casefold()
            canonical_name = str(item.get("name", "")).casefold()
            if canonical_id in seen_ids:
                continue
            if (
                not self._course_matches_goal(item, career_goal)
                and canonical_name not in popular_names
                and canonical_name not in pending_names
            ):
                continue
            seen_ids.add(canonical_id)
            accepted.append({
                "course_id": item.get("id", ""),
                "course_name": item.get("name", ""),
            })
            if len(accepted) == 3:
                break

        sanitized = {
            "stages": [{
                "stage_number": 1,
                "stage_title": "Кандидаты для экспертной проверки",
                "recommended_period": "",
                "stage_goal": "",
                "courses": accepted,
            }],
            "limitations": list(plan.get("limitations", []))[:2],
        }
        changed = len(raw_courses) != len(accepted) or len(plan.get("stages", [])) != 1
        return sanitized, changed

    def _run_pipeline(self, input_data: str, model_type: str) -> str:
        request_id = ""
        try:
            req_data = json.loads(input_data)
            request_id = str(req_data.get("request_id", req_data.get("batch_id", "")))
            self._set_progress(request_id, "profile_analysis", "Анализируем профиль и историю обучения.", 30)
            if self._is_local_model(model_type) and not self._wait_for_local_model():
                raise RuntimeError("Local OpenAI-compatible model did not become ready before timeout")
            
            # Извлекаем профиль сотрудника
            employee_data = req_data.get("employee", {})
            if not employee_data and "fio" in req_data:
                employee_data = req_data
            if not isinstance(employee_data, dict):
                raise ValueError("employee must be an object")

            real_fio = str(employee_data.get("fio", "")).strip()
            position = str(employee_data.get("position", "")).strip()
            department = str(employee_data.get("department", "")).strip()
            career_goal = str(employee_data.get("career_goal", "")).strip()
            if not real_fio or not position or not department:
                raise ValueError("employee fio, position and department are required")
            learning_history = employee_data.get("learning_history", [])
            history_facts = self._classify_learning_history(learning_history)
            normalized_learning_history = history_facts["deduplicated_history"]
            
            # Встроенный managed runtime остаётся внутри Docker-сети. Внешний
            # OpenAI-compatible endpoint получает ту же псевдонимизацию, что и
            # облачные провайдеры, даже если он называется «локальным».
            trusted_managed_local = self._is_local_model(model_type) and local_llm_mode() == "managed"
            safe_fio = real_fio if trusted_managed_local else self._pseudonymize_fio(real_fio)
            is_external_model = not trusted_managed_local
            model_position = self._mask_external_text(position, real_fio, safe_fio) if is_external_model else position
            model_department = self._mask_external_text(department, real_fio, safe_fio) if is_external_model else department
            model_career_goal = self._mask_external_text(career_goal, real_fio, safe_fio) if is_external_model else career_goal
            model_learning_history = [
                {
                    "course_name": self._mask_external_text(item.get("course_name", ""), real_fio, safe_fio),
                    "course_type": self._mask_external_text(item.get("course_type", ""), real_fio, safe_fio),
                    "status": self._mask_external_text(item.get("status", ""), real_fio, safe_fio),
                }
                for item in normalized_learning_history
                if isinstance(item, dict)
            ] if is_external_model else normalized_learning_history
            model_completed_course_names = set(
                self._classify_learning_history(model_learning_history)["completed_names"]
            )
            
            # Completion wins over contradictory pending rows. Unknown statuses
            # are diagnostic facts, never an implicit recommendation signal.
            completed_course_names = set(history_facts["completed_names"])
            pending_course_names = {
                history_facts["pending_display"][name]
                for name in history_facts["pending_names"]
            }
            
            # Получаем реальный бенчмарк по когорте (должность + ИОГВ)
            cohort_benchmark = self._find_cohort_benchmark(position, department)
            total_colleagues = cohort_benchmark.get("total_employees", 0)
            popular_courses_dict = cohort_benchmark.get("courses", {})
            cohort_note = cohort_benchmark.get("cohort_note", "")
            cohort_type = cohort_benchmark.get("cohort_type", "none")
            model_cohort_note = self._mask_external_text(cohort_note, real_fio, safe_fio) if is_external_model else cohort_note
            
            # Сортируем популярные курсы по востребованности среди коллег
            sorted_popular = sorted(
                popular_courses_dict.values(),
                key=lambda x: x.get("popularity_pct", 0),
                reverse=True
            )
            
            top_colleague_courses = [
                {
                    "course_name": c["course_name"],
                    "type": c.get("course_type", ""),
                    "popularity_pct": c.get("popularity_pct"),
                    "success_rate": c.get("success_rate")
                }
                for c in sorted_popular[:10]
            ]
            
            # Фильтруем доступный каталог: исключаем уже пройденные
            available_catalog = []
            for item in self.catalog:
                if item["name"].lower() not in completed_course_names:
                    available_catalog.append(item)
            
            # Ранжируем кандидатов по всему доступному каталогу
            ranked_catalog = self._rank_catalog_candidates(
                available_catalog, career_goal, position, department, popular_courses_dict,
                pending_course_names,
            )
            self._set_progress(request_id, "course_selection", "Сопоставляем профиль с программами официального каталога.", 58)
            
            catalog_sample = self._compact_catalog_candidates(ranked_catalog)
            
            # Создаем очередь агентов
            agent_queue = self.agent_factory.create_queue(model_type)
            analyst = agent_queue[0]      # competency-analyst
            architect = agent_queue[1]    # trajectory-architect
            justifier = agent_queue[2]    # trajectory-justifier
            
            # ----------------------------------------------------
            # ШАГ 1: Агент анализа профиля и дефицита компетенций
            # ----------------------------------------------------
            logger.info("[%s] Step 1: competency-analyst starting", model_type)
            step1_input = json.dumps({
                "employee": {
                    "fio": safe_fio,
                    "position": model_position,
                    "department": model_department,
                    "career_goal": model_career_goal,
                    "completed_courses_count": len(completed_course_names),
                    "completed_courses": list(completed_course_names),
                    "learning_history": model_learning_history
                },
                "cohort_benchmark": {
                    "position": model_position,
                    "department": model_department,
                    "total_colleagues": total_colleagues,
                    "cohort_note": model_cohort_note,
                    "top_courses": top_colleague_courses[:6]
                }
            }, ensure_ascii=False)
            
            pipeline_degraded = False
            pipeline_limitations = []
            try:
                analyst_raw = self._execute_agent_with_recovery(
                    analyst, self.system_prompts[0]["prompt"], step1_input, model_type
                )
                analyst_res = self._validated_agent_object(analyst_raw, "observed_development_signals")
            except Exception as exception:
                pipeline_degraded = True
                pipeline_limitations.append("Ответ агента анализа профиля отклонен; использованы только факты исходного профиля.")
                logger.warning("[%s] competency-analyst response rejected (%s)", model_type, type(exception).__name__)
                analyst_res = self._deterministic_competency_analysis(
                    model_career_goal, model_completed_course_names
                )
            
            # ----------------------------------------------------
            # ШАГ 2: Агент проектирования структуры траектории
            # ----------------------------------------------------
            logger.info("[%s] Step 2: trajectory-architect starting", model_type)
            step2_input = json.dumps({
                "employee": {"fio": safe_fio, "position": model_position, "department": model_department, "career_goal": model_career_goal},
                "competency_analysis": analyst_res,
                "available_catalog_candidates": catalog_sample,
                "available_catalog_count": len(catalog_sample),
                "full_catalog_count": len(self.catalog),
                "colleague_top_courses": top_colleague_courses[:8]
            }, ensure_ascii=False)
            
            try:
                architect_raw = self._execute_agent_with_recovery(
                    architect, self.system_prompts[1]["prompt"], step2_input, model_type
                )
                architect_res = self._validated_agent_object(architect_raw, "stages")
                architect_res, architect_changed = self._sanitize_architect_plan(
                    architect_res, catalog_sample, career_goal, popular_courses_dict,
                    pending_course_names,
                )
                if architect_changed:
                    pipeline_degraded = True
                    pipeline_limitations.append(
                        "Часть кандидатов агента проектирования отклонена: для них не найдены проверяемые основания "
                        "в цели, непройденной истории обучения или когортном срезе."
                    )
            except Exception as exception:
                pipeline_degraded = True
                pipeline_limitations.append("Ответ агента проектирования отклонен; применен проверяемый серверный отбор.")
                logger.warning("[%s] trajectory-architect response rejected (%s)", model_type, type(exception).__name__)
                architect_res = self._deterministic_trajectory_plan(
                    ranked_catalog, career_goal, popular_courses_dict, pending_course_names
                )
            self._set_progress(request_id, "result_formation", "Проверяем обоснования и формируем итоговую траекторию.", 82)

            selected_catalog_ids = {
                str(course.get("course_id", "")).casefold()
                for stage in architect_res.get("stages", [])
                if isinstance(stage, dict)
                for course in stage.get("courses", [])
                if isinstance(course, dict) and course.get("course_id")
            }
            selected_catalog_reference = [
                item
                for item in catalog_sample
                if str(item.get("id", "")).casefold() in selected_catalog_ids
            ]
            
            # ----------------------------------------------------
            # ШАГ 3: Агент методического обоснования и финальной валидации
            # ----------------------------------------------------
            logger.info("[%s] Step 3: trajectory-justifier starting", model_type)
            step3_input = json.dumps({
                "employee": {"fio": safe_fio, "position": model_position, "department": model_department, "career_goal": model_career_goal},
                "competency_analysis": analyst_res,
                "trajectory_plan": architect_res,
                "catalog_reference": selected_catalog_reference,
                "colleague_statistics": {
                    "total_in_cohort": total_colleagues,
                    "cohort_note": model_cohort_note,
                    "top_courses": top_colleague_courses
                }
            }, ensure_ascii=False)
            
            try:
                justifier_raw = self._execute_agent_with_recovery(
                    justifier, self.system_prompts[2]["prompt"], step3_input, model_type
                )
                justifier_res = self._validated_agent_object(justifier_raw, "stages")
            except Exception as exception:
                pipeline_degraded = True
                pipeline_limitations.append("Ответ агента обоснования отклонен; итог проверен сервером по исходному каталогу.")
                logger.warning("[%s] trajectory-justifier response rejected (%s)", model_type, type(exception).__name__)
                justifier_res = {
                    "summary": "",
                    "stages": architect_res.get("stages", []),
                    "competency_radar": [],
                    "limitations": [
                        "Ответ агента обоснования отклонен; итог проверен по исходному каталогу без добавления новых фактов."
                    ],
                }
            
            # Обогащаем результат точными данными из реального каталога (аннотации, цели, ZUV результаты)
            # и возвращаем реальное ФИО сотрудника
            final_trajectory = self._enrich_and_validate_trajectory(
                justifier_res, real_fio, position, department, career_goal, completed_course_names, top_colleague_courses,
                total_colleagues, cohort_note, cohort_type, ranked_catalog, pending_course_names, history_facts
            )
            for limitation in pipeline_limitations:
                if limitation not in final_trajectory["limitations"]:
                    final_trajectory["limitations"].append(limitation)
            validation_degraded = bool(final_trajectory.pop("_validation_degraded", False)) or pipeline_degraded
            metadata = self._generation_metadata(model_type, "degraded" if validation_degraded else "verified")
            final_trajectory.update(metadata)
            
            final_response = {
                "batch_id": req_data.get("request_id", req_data.get("batch_id", "trajectory_batch_1")),
                **metadata,
                "trajectory": final_trajectory,
                "courses_analysis": [final_trajectory]
            }
            self._set_progress(request_id, "completed", "Траектория сформирована.", 100)
            return json.dumps(final_response, ensure_ascii=False, indent=2)

        except Exception as e:
            logger.error("Pipeline execution failed (%s)", type(e).__name__)
            # В случае ошибки возвращаем честную структуру на основе ранжированного каталога
            self._set_progress(request_id, "result_formation", "Основная модель недоступна; проверяем резервный результат.", 88)
            fallback = self._build_deterministic_trajectory_fallback(input_data)
            try:
                fallback_status = json.loads(fallback).get("quality_status")
            except (TypeError, json.JSONDecodeError):
                fallback_status = "failed"
            if fallback_status == "failed":
                self._set_progress(request_id, "failed", "Не удалось сформировать корректный результат.", 100)
            else:
                self._set_progress(request_id, "completed", "Резервная траектория сформирована и требует проверки.", 100)
            return fallback

    def _enrich_and_validate_trajectory(
        self,
        ai_result: Dict[str, Any],
        fio: str,
        position: str,
        department: str,
        career_goal: str,
        completed_course_names: Set[str],
        top_colleague_courses: List[Dict[str, Any]],
        total_colleagues: int,
        cohort_note: str,
        cohort_type: str,
        ranked_catalog: List[Dict[str, Any]],
        pending_course_names: Optional[Set[str]] = None,
        history_facts: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Проверка и обогащение метаданными из каталога:
        - Исключение курсов, которые уже пройдены
        - Заполнение аннотаций, часов и результатов из каталога
        - Доказательное обоснование со ссылкой на коллег
        """
        # Поиск по имени в каталоге
        catalog_by_name = {c["name"].casefold(): c for c in self.catalog}
        catalog_by_id = {str(c.get("id", "")).casefold(): c for c in self.catalog if c.get("id")}
        top_colleague_names = {c.get("course_name", "").lower(): c for c in top_colleague_courses}
        pending_display_by_name = dict((history_facts or {}).get("pending_display", {})) or {
            name.casefold(): name.strip() for name in (pending_course_names or set()) if name.strip()
        }
        completed_names = set((history_facts or {}).get("completed_names", set())) or {
            name.casefold() for name in completed_course_names
        }
        conflicting_status_names = set((history_facts or {}).get("conflicting_names", set()))
        if not history_facts:
            conflicting_status_names = set(pending_display_by_name) & completed_names
        pending_names = set(pending_display_by_name) - completed_names
        unmatched_pending_names = pending_names - set(catalog_by_name) - conflicting_status_names
        eligible_pending_names = pending_names & set(catalog_by_name) - completed_names
        cohort_limitations = []
        if total_colleagues <= 0:
            cohort_limitations.append("Нет подтвержденной когорты коллег по сочетанию должность + ИОГВ.")
        elif "общегородской" in cohort_note.lower() or "смежной" in cohort_note.lower():
            cohort_limitations.append("Использован расширенный бенчмарк вместо точной пары должность + ИОГВ.")

        duplicate_count = int((history_facts or {}).get("duplicate_count", 0) or 0)
        if duplicate_count:
            cohort_limitations.append(
                f"В истории объединены точные дубли записей — {duplicate_count}; они не влияют повторно на рекомендации."
            )
        unknown_statuses = list((history_facts or {}).get("unknown_statuses", []))
        if unknown_statuses:
            unknown_details = ", ".join(
                f"«{item.get('course_name', '')}» ({item.get('status') or 'пустой статус'})"
                for item in unknown_statuses
            )
            cohort_limitations.append(
                "Записи с неизвестным статусом не использованы как непройденные программы: " + unknown_details + "."
            )
        
        raw_stages = ai_result.get("stages", [])
        stages = raw_stages if isinstance(raw_stages, list) else []
        seen_in_trajectory = set()
        cleaned_courses = []
        validation_degraded = False
        missing_catalog_count = 0
        unsupported_count = 0
        excess_count = 0
        if (
            len(stages) != 1
            or not stages
            or not isinstance(stages[0], dict)
            or stages[0].get("recommended_period")
            or stages[0].get("stage_goal")
        ):
            validation_degraded = True
            cohort_limitations.append(
                "Этапность, сроки и зависимости модели отклонены: во входных данных нет календаря и подтвержденных пререквизитов."
            )

        def accept_course(course: Dict[str, Any], *, from_model: bool) -> None:
            nonlocal validation_degraded, missing_catalog_count, unsupported_count, excess_count
            c_name = str(course.get("course_name", "")).strip()
            c_id = str(course.get("course_id", "")).strip()
            if not c_name and not c_id:
                return

            # ID is canonical; exact name matching remains for provider compatibility.
            catalog_item = catalog_by_id.get(c_id.casefold()) if c_id else None
            if catalog_item is None and c_name:
                catalog_item = catalog_by_name.get(c_name.casefold())
            if not catalog_item:
                if from_model:
                    validation_degraded = True
                    missing_catalog_count += 1
                return

            canonical_name = str(catalog_item.get("name", c_name)).strip()
            canonical_key = canonical_name.casefold()
            if canonical_key in completed_names or canonical_key in seen_in_trajectory:
                return

            benchmark_match = top_colleague_names.get(canonical_key)
            goal_match = self._course_matches_goal(catalog_item, career_goal)
            pending_match = canonical_key in pending_names
            if not goal_match and not benchmark_match and not pending_match:
                if from_model:
                    validation_degraded = True
                    unsupported_count += 1
                return

            if len(cleaned_courses) >= self.MAX_RECOMMENDED_COURSES:
                if from_model:
                    validation_degraded = True
                    excess_count += 1
                return
            seen_in_trajectory.add(canonical_key)

            course_sources = [f"Каталог 2025: {catalog_item.get('id', c_name)}"]
            justification_parts = []
            if goal_match:
                course_sources.insert(0, f"Заявленная цель: {career_goal}")
                justification_parts.append(
                    f"Карточка программы содержит термины, совпадающие с заявленной целью «{career_goal}»."
                )
            if benchmark_match:
                course_sources.append(cohort_note)
                popularity = benchmark_match.get("popularity_pct")
                success_rate = benchmark_match.get("success_rate")
                cohort_values = []
                if isinstance(popularity, (int, float)):
                    cohort_values.append(f"популярность {popularity:g}%")
                if isinstance(success_rate, (int, float)):
                    cohort_values.append(f"успешность {success_rate:g}%")
                justification_parts.append(
                    "Программа присутствует в подтвержденном когортном срезе"
                    + (f" ({', '.join(cohort_values)})" if cohort_values else "") + "."
                )
            if pending_match:
                course_sources.append("История обучения: программа имеет статус «Не пройден»")
                justification_parts.append(
                    "Программа присутствует в исходной истории со статусом «Не пройден» и сохранена как кандидат для завершения."
                )

            cleaned_courses.append({
                "course_id": catalog_item.get("id", ""),
                "course_name": canonical_name,
                "type": catalog_item.get("type", ""),
                "category": catalog_item.get("category", ""),
                "duration_hours": catalog_item.get("duration_hours", 0),
                "competencies": catalog_item.get("competencies", []),
                "annotation": catalog_item.get("annotation", ""),
                "learning_outcomes": catalog_item.get("results", ""),
                "justification": " ".join(justification_parts),
                "evidence_sources": course_sources,
                "cohort_evidence": benchmark_match or None,
                "limitations": list(cohort_limitations),
                "priority": "",
                "status": "Рекомендован",
            })

        # First validate only what the model actually returned. This keeps model
        # rejection diagnostics separate from deterministic server completion.
        for stage in stages:
            if not isinstance(stage, dict):
                validation_degraded = True
                continue
            courses = stage.get("courses", [])
            if not isinstance(courses, list):
                validation_degraded = True
                continue
            for course in courses:
                if isinstance(course, dict):
                    accept_course(course, from_model=True)

        # Fill remaining slots only with exact pending/catalog matches. These are
        # server-selected candidates and must not be counted as excess model output.
        for catalog_item in ranked_catalog:
            if len(cleaned_courses) >= self.MAX_RECOMMENDED_COURSES:
                break
            canonical_key = str(catalog_item.get("name", "")).casefold()
            if canonical_key in eligible_pending_names and canonical_key not in seen_in_trajectory:
                accept_course({
                    "course_id": catalog_item.get("id", ""),
                    "course_name": catalog_item.get("name", ""),
                }, from_model=False)

        if missing_catalog_count:
            cohort_limitations.append(
                "Часть ответа модели отклонена: количество программ вне официального каталога 2025 года — "
                f"{missing_catalog_count}."
            )
        if unsupported_count:
            cohort_limitations.append(
                "Часть ответа модели отклонена: количество программ без проверяемой связи с заявленной целью, "
                f"непройденной историей или когортой — {unsupported_count}."
            )
        if excess_count:
            cohort_limitations.append(
                "Часть ответа модели отклонена: количество программ сверх лимита из "
                f"{self.MAX_RECOMMENDED_COURSES} кандидатов — {excess_count}."
            )

        if conflicting_status_names:
            conflicts = ", ".join(
                f"«{pending_display_by_name[name]}»" for name in sorted(conflicting_status_names)
            )
            cohort_limitations.append(
                "В истории найдены противоречивые статусы «Пройден» и «Не пройден». "
                f"Статус «Пройден» имеет приоритет, поэтому программы исключены: {conflicts}."
            )

        if unmatched_pending_names:
            unmatched = ", ".join(
                f"«{pending_display_by_name[name]}»" for name in sorted(unmatched_pending_names)
            )
            cohort_limitations.append(
                "Непройденные программы не найдены в официальном каталоге 2025 года и не рекомендованы: "
                f"{unmatched}."
            )

        selected_names = {course["course_name"].casefold() for course in cleaned_courses}
        omitted_pending_names = eligible_pending_names - selected_names
        if omitted_pending_names:
            omitted = ", ".join(
                f"«{pending_display_by_name[name]}»" for name in sorted(omitted_pending_names)
            )
            reason = (
                f"из-за лимита из {self.MAX_RECOMMENDED_COURSES} кандидатов"
                if len(cleaned_courses) >= self.MAX_RECOMMENDED_COURSES
                else "по результатам проверяемого отбора"
            )
            cohort_limitations.append(
                f"Подтвержденные непройденные программы не включены {reason}: {omitted}."
            )

        if not cleaned_courses:
            validation_degraded = True
            available_signals = []
            if career_goal.strip():
                available_signals.append("заявленная цель")
            if pending_names:
                available_signals.append("непройденные программы")
            if total_colleagues > 0:
                available_signals.append("когортный срез")
            if available_signals and not conflicting_status_names and not unmatched_pending_names:
                cohort_limitations.append(
                    "Подтвержденные основания не дали совпадений с непройденными программами официального каталога."
                )
            else:
                cohort_limitations.append(
                    "Рекомендации не сформированы: цель развития не указана, подтвержденная когорта отсутствует, "
                    "а непройденные программы из официального каталога в истории не найдены."
                )

        cleaned_stages = [{
            "stage_number": 1,
            "stage_title": "Кандидаты для экспертной проверки",
            "recommended_period": "",
            "stage_goal": "",
            "courses": cleaned_courses
        }]

        # Входной контракт не содержит подтвержденных измерений уровней компетенций.
        # Поэтому численные значения модели не считаются источником истины и не публикуются.
        model_radar = ai_result.get("competency_radar", [])
        radar = []
        trajectory_limitations = list(cohort_limitations)
        if model_radar:
            validation_degraded = True
            trajectory_limitations.append("Численные уровни компетенций модели отклонены: входные данные не содержат подтвержденных измерений.")
        else:
            trajectory_limitations.append("Матрица компетенций не построена: входные данные не содержат подтвержденных измерений.")
            
        if cleaned_courses:
            used_sources = []
            if career_goal.strip():
                used_sources.append("заявленная цель")
            if any(course["course_name"].casefold() in pending_names for course in cleaned_courses):
                used_sources.append("непройденные программы истории обучения")
            if any(course.get("cohort_evidence") for course in cleaned_courses):
                used_sources.append("подтвержденный когортный срез")
            source_text = ", ".join(used_sources) or "проверяемые входные данные"
            summary = (
                f"Сформировано кандидатов из официального каталога: {len(cleaned_courses)}. "
                f"Использованные основания: {source_text}."
            )
        else:
            summary = (
                "Рекомендации не сформированы: во входных данных недостаточно подтвержденных оснований "
                "для выбора непройденных программ из официального каталога."
            )

        return {
            "trajectory_id": ai_result.get("trajectory_id", f"traj_{fio.replace(' ', '_')}"),
            "employee_name": fio,
            "position": position,
            "department": department,
            "summary": summary,
            "stages": cleaned_stages,
            "competency_radar": radar,
            "limitations": trajectory_limitations,
            "colleague_benchmark": {
                "total_colleagues_in_position": total_colleagues,
                "cohort_size": total_colleagues,
                "scope": {
                    "position_and_department": "должность + ИОГВ",
                    "position_wide": "должность",
                }.get(cohort_type, ""),
                "cohort_note": cohort_note,
                "limitations": cohort_limitations,
                "top_recommended_for_position": top_colleague_courses
            },
            "_validation_degraded": validation_degraded
        }

    _GOAL_STOP_WORDS = {
        "власти", "государственной", "государственный", "государственного",
        "государственные", "государства", "орган", "органах", "органов", "органы",
        "развитие", "развить", "обучение", "повышение", "профессиональное",
        "профессиональных", "компетенции", "компетенций", "навыки", "навыков",
        "курс", "курсы", "сфера", "сфере", "санкт", "петербурга",
    }
    _BROAD_GOAL_ROOTS = {"управл"}

    @staticmethod
    def _normalized_words(value: Any) -> str:
        return " ".join(re.findall(r"[a-zа-яё0-9]+", str(value or "").casefold()))

    @staticmethod
    def _stem_goal_word(word: str) -> str:
        """Conservative Russian inflection normalization without semantic guessing."""
        suffixes = (
            "иями", "ями", "ами", "его", "ого", "ему", "ому", "ими", "ыми",
            "ией", "ия", "ья", "ию", "ью", "ие", "ье", "ов", "ев",
            "ее", "ые", "ое", "ей", "ий", "ый", "ой", "ем", "им", "ым", "ом",
            "их", "ых", "ую", "юю", "ая", "яя", "ою", "ею", "ам", "ям",
            "ах", "ях", "ы", "и", "а", "я", "у", "ю", "е",
        )
        stem = word
        for suffix in suffixes:
            if stem.endswith(suffix) and len(stem) - len(suffix) >= 5:
                stem = stem[:-len(suffix)]
                break
        # Adjectival forms such as «проектное/проектный» and «командной».
        if stem.endswith("н") and len(stem) >= 7:
            stem = stem[:-1]
        return stem

    @classmethod
    def _significant_roots(cls, value: Any) -> Set[str]:
        roots = set()
        for word in re.findall(r"[a-zа-яё0-9]+", str(value or "").casefold()):
            if len(word) < 4 or word in cls._GOAL_STOP_WORDS:
                continue
            roots.add(cls._stem_goal_word(word))
        return roots

    @classmethod
    def _course_matches_goal(cls, course: Dict[str, Any], career_goal: str) -> bool:
        goal_roots = cls._significant_roots(career_goal)
        if not goal_roots:
            return False
        if cls._normalized_words(course.get("name", "")) == cls._normalized_words(career_goal):
            return True
        corpus = " ".join([
            str(course.get("name", "")),
            str(course.get("annotation", "")),
            str(course.get("target", "")),
            " ".join(str(value) for value in course.get("competencies", [])),
            str(course.get("results", "")),
        ])
        name_overlap = goal_roots & cls._significant_roots(course.get("name", ""))
        corpus_overlap = goal_roots & cls._significant_roots(corpus)
        if len(name_overlap) >= 2 or len(corpus_overlap) >= 2:
            return True
        if name_overlap - cls._BROAD_GOAL_ROOTS:
            return True
        return len(goal_roots) == 1 and bool(corpus_overlap)

    def _build_deterministic_trajectory_fallback(self, input_data: str) -> str:
        """Детерминированное построение траектории на основе ранжированного каталога при сбое модели"""
        try:
            req_data = json.loads(input_data)
            emp = req_data.get("employee", req_data)
            if not isinstance(emp, dict):
                raise ValueError("employee must be an object")
            fio = str(emp.get("fio", "")).strip()
            position = str(emp.get("position", "")).strip()
            department = str(emp.get("department", "")).strip()
            career_goal = str(emp.get("career_goal", "")).strip()
            if not fio or not position or not department:
                raise ValueError("employee fio, position and department are required")
            learning_history = emp.get("learning_history", [])
            history_facts = self._classify_learning_history(learning_history)
            completed_course_names = set(history_facts["completed_names"])
            pending_course_names = {
                history_facts["pending_display"][name]
                for name in history_facts["pending_names"]
            }
                    
            cohort_bench = self._find_cohort_benchmark(position, department)
            pop_dict = cohort_bench.get("courses", {})
            
            avail = [c for c in self.catalog if c["name"].lower() not in completed_course_names]
            ranked = self._rank_catalog_candidates(
                avail, career_goal, position, department, pop_dict, pending_course_names
            )

            candidates = []
            for course in ranked:
                has_goal_match = self._course_matches_goal(course, career_goal)
                has_exact_cohort_match = course.get("name", "").casefold() in {
                    name.casefold() for name in pop_dict
                }
                has_pending_match = course.get("name", "").casefold() in {
                    name.casefold() for name in pending_course_names
                }
                if has_goal_match or has_exact_cohort_match or has_pending_match:
                    candidates.append(course)
                if len(candidates) == self.MAX_RECOMMENDED_COURSES:
                    break
            stages = [
                {
                    "stage_number": 1,
                    "stage_title": "Кандидаты для экспертной проверки",
                    "recommended_period": "",
                    "stage_goal": "",
                    "courses": [self._format_course_dict(c, position, department) for c in candidates]
                }
            ]
            
            top_colleagues = [
                {
                    "course_name": c["course_name"],
                    "type": c.get("course_type", ""),
                    "popularity_pct": c.get("popularity_pct"),
                    "success_rate": c.get("success_rate")
                }
                for c in sorted(pop_dict.values(), key=lambda x: x.get("popularity_pct", 0), reverse=True)[:8]
            ]
            
            traj = self._enrich_and_validate_trajectory(
                {"trajectory_id": f"traj_det_{fio.replace(' ', '_')}", "stages": stages},
                fio,
                position,
                department,
                career_goal,
                completed_course_names,
                top_colleagues,
                cohort_bench.get("total_employees", 0),
                cohort_bench.get("cohort_note", ""),
                cohort_bench.get("cohort_type", "none"),
                ranked,
                pending_course_names,
                history_facts,
            )
            traj["limitations"].extend([
                "LLM-конвейер не завершился; использован детерминированный fallback.",
                "Результат требует экспертной проверки перед использованием.",
            ])
            metadata = self._generation_metadata(
                str(req_data.get("model_type", "unknown")), "degraded", "fallback"
            )
            traj.update(metadata)
            
            return json.dumps({
                "batch_id": req_data.get("request_id", "batch_fallback"),
                **metadata,
                "trajectory": traj,
                "courses_analysis": [traj]
            }, ensure_ascii=False, indent=2)
        except Exception as ex:
            logger.error("Fallback building failed (%s)", type(ex).__name__)
            return json.dumps({
                "generation_mode": "fallback",
                "quality_status": "failed",
                "limitations": ["Входные данные не удалось преобразовать в профиль сотрудника."]
            }, ensure_ascii=False)

    def _format_course_dict(self, item: Dict[str, Any], position: str, department: str) -> Dict[str, Any]:
        return {
            "course_id": item["id"],
            "course_name": item["name"],
            "type": item["type"],
            "category": item.get("category", ""),
            "duration_hours": item.get("duration_hours", 0),
            "competencies": item.get("competencies", []),
            "annotation": item.get("annotation", ""),
            "learning_outcomes": item.get("results", ""),
            "justification": "",
            "evidence_sources": [
                f"Профиль: {position}, {department}",
                f"Каталог 2025: {item['id']}",
                "Детерминированное ранжирование после сбоя LLM"
            ],
            "limitations": ["Кандидат выбран fallback-алгоритмом; обоснование и место в траектории требуют экспертной проверки."],
            "priority": "",
            "status": "Требует экспертной проверки"
        }
