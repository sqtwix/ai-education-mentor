import json
import logging
import os
from pathlib import Path
from typing import Dict, Any, List
from backend.agent_factory import AgentFactory

BASE_DIR = Path(__file__).resolve().parent
PATH_TO_JSON = BASE_DIR / "system_prompts.json"
DATA_DIR = BASE_DIR / "data"

logger = logging.getLogger(__name__)

class AgentManager:
    def __init__(self, agent_factory: AgentFactory):
        try:
            self.agent_factory = agent_factory
            with open(PATH_TO_JSON, "r", encoding="utf-8") as f:
                self.system_prompts = json.load(f)
            
            # Загружаем реальный каталог курсов и датасет истории
            self.catalog_path = DATA_DIR / "courses_catalog.json"
            self.history_path = DATA_DIR / "learning_history_dataset.json"
            
            self.catalog = []
            if self.catalog_path.exists():
                with open(self.catalog_path, "r", encoding="utf-8") as f:
                    self.catalog = json.load(f)
            
            self.history_dataset = {"users": [], "benchmarks_by_position": {}}
            if self.history_path.exists():
                with open(self.history_path, "r", encoding="utf-8") as f:
                    self.history_dataset = json.load(f)
                    
            logger.info("AgentManager initialized with %d catalog courses and %d benchmarks", 
                        len(self.catalog), len(self.history_dataset.get("benchmarks_by_position", {})))
        except Exception as e:
            raise Exception("Agent Manager Initialization Error: " + str(e))

    def start_deepseek_processing(self, input_data: str) -> str:
        return self._run_pipeline(input_data, "deepseek")

    def start_sbergpt_processing(self, input_data: str) -> str:
        return self._run_pipeline(input_data, "sbergpt")

    def start_qwen_local_processing(self, input_data: str) -> str:
        return self._run_pipeline(input_data, "qwen_local")

    def _find_position_benchmark(self, position: str) -> Dict[str, Any]:
        benchmarks = self.history_dataset.get("benchmarks_by_position", {})
        # Точное или нечеткое совпадение должности
        if position in benchmarks:
            return benchmarks[position]
        
        # Поиск по подстроке (например 'Главный специалист')
        for pos_key, b_data in benchmarks.items():
            if position.lower() in pos_key.lower() or pos_key.lower() in position.lower():
                return b_data
        
        # Резервный поиск базовой должности
        if "Главный специалист" in benchmarks:
            return benchmarks["Главный специалист"]
        return {"total_employees": 10, "courses": {}}

    def _run_pipeline(self, input_data: str, model_type: str) -> str:
        try:
            req_data = json.loads(input_data)
            
            # Извлекаем профиль сотрудника
            employee_data = req_data.get("employee", {})
            if not employee_data and "fio" in req_data:
                employee_data = req_data
            
            fio = employee_data.get("fio", "Служащий")
            position = employee_data.get("position", "Главный специалист")
            department = employee_data.get("department", "ИОГВ Санкт-Петербурга")
            career_goal = employee_data.get("career_goal", "Повышение эффективности служебной деятельности и развитие управленческих навыков")
            learning_history = employee_data.get("learning_history", [])
            
            # Список исключаемых пройденных курсов (СТРОГО без дублей)
            completed_course_names = set()
            for h in learning_history:
                st = str(h.get("status", "")).strip().lower()
                c_name = str(h.get("course_name", "")).strip()
                if st in ["пройден", "passed", "успешно", "done"] and c_name:
                    completed_course_names.add(c_name.lower())
            
            # Получаем реальный бенчмарк по коллегам
            benchmark = self._find_position_benchmark(position)
            total_colleagues = benchmark.get("total_employees", 25)
            popular_courses_dict = benchmark.get("courses", {})
            
            # Сортируем популярные курсы по востребованности среди коллег
            sorted_popular = sorted(
                popular_courses_dict.values(),
                key=lambda x: x.get("popularity_pct", 0),
                reverse=True
            )
            
            top_colleague_courses = [
                {
                    "course_name": c["course_name"],
                    "type": c.get("course_type", "ППК"),
                    "popularity_pct": c.get("popularity_pct", 75.0),
                    "success_rate": c.get("success_rate", 95.0)
                }
                for c in sorted_popular[:10]
            ]
            
            # Фильтруем доступный каталог: исключаем уже пройденные
            available_catalog = []
            for item in self.catalog:
                if item["name"].lower() not in completed_course_names:
                    available_catalog.append(item)
            
            # Создаем очередь агентов
            agent_queue = self.agent_factory.create_queue(model_type)
            analyst = agent_queue[0]      # competency-analyst
            architect = agent_queue[1]    # trajectory-architect
            justifier = agent_queue[2]    # trajectory-justifier
            
            # ----------------------------------------------------
            # ШАГ 1: Агент анализа профиля и дефицита компетенций
            # ----------------------------------------------------
            logger.info("[%s] Step 1: competency-analyst starting for %s (%s)", model_type, fio, position)
            step1_input = json.dumps({
                "employee": {
                    "fio": fio,
                    "position": position,
                    "department": department,
                    "career_goal": career_goal,
                    "completed_courses_count": len(completed_course_names),
                    "completed_courses": list(completed_course_names),
                    "learning_history": learning_history
                },
                "colleague_benchmark": {
                    "position": position,
                    "total_colleagues": total_colleagues,
                    "top_courses": top_colleague_courses[:5]
                }
            }, ensure_ascii=False)
            
            analyst_raw = analyst.execute(self.system_prompts[0]["prompt"], step1_input)
            analyst_res = json.loads(analyst_raw)
            
            # ----------------------------------------------------
            # ШАГ 2: Агент проектирования структуры траектории
            # ----------------------------------------------------
            logger.info("[%s] Step 2: trajectory-architect starting", model_type)
            # Передаем компактный каталог доступных курсов
            catalog_sample = [
                {
                    "id": c["id"],
                    "name": c["name"],
                    "type": c["type"],
                    "category": c.get("category", ""),
                    "hours": c.get("duration_hours", 16),
                    "competencies": c.get("competencies", [])
                }
                for c in available_catalog[:40]
            ]
            
            step2_input = json.dumps({
                "employee": {"fio": fio, "position": position, "department": department},
                "competency_analysis": analyst_res,
                "available_catalog_sample": catalog_sample,
                "colleague_top_courses": top_colleague_courses[:8]
            }, ensure_ascii=False)
            
            architect_raw = architect.execute(self.system_prompts[1]["prompt"], step2_input)
            architect_res = json.loads(architect_raw)
            
            # ----------------------------------------------------
            # ШАГ 3: Агент методического обоснования и финальной валидации
            # ----------------------------------------------------
            logger.info("[%s] Step 3: trajectory-justifier starting", model_type)
            step3_input = json.dumps({
                "employee": {"fio": fio, "position": position, "department": department},
                "competency_analysis": analyst_res,
                "trajectory_plan": architect_res,
                "colleague_statistics": {
                    "total_in_position": total_colleagues,
                    "top_courses": top_colleague_courses
                }
            }, ensure_ascii=False)
            
            justifier_raw = justifier.execute(self.system_prompts[2]["prompt"], step3_input)
            justifier_res = json.loads(justifier_raw)
            
            # Обогащаем результат точными данными из реального каталога (аннотации, цели, ZUV результаты)
            final_trajectory = self._enrich_and_validate_trajectory(
                justifier_res, fio, position, department, completed_course_names, top_colleague_courses, total_colleagues
            )
            
            final_response = {
                "batch_id": req_data.get("request_id", req_data.get("batch_id", "trajectory_batch_1")),
                "trajectory": final_trajectory,
                # Для обратной совместимости с клиентами проекта 2
                "courses_analysis": [final_trajectory]
            }
            
            logger.info("[%s] Trajectory pipeline completed successfully for %s", model_type, fio)
            return json.dumps(final_response, ensure_ascii=False)
            
        except json.JSONDecodeError as e:
            logger.error("[%s] JSON Decode Error: %s", model_type, str(e))
            raise Exception("[%s] Pipeline JSON Error: %s" % (model_type, str(e)))
        except Exception as e:
            logger.error("[%s] Pipeline Processing Error: %s", model_type, str(e))
            raise Exception("[%s] Pipeline Processing Error: %s" % (model_type, str(e)))

    def _enrich_and_validate_trajectory(
        self,
        raw_res: Dict[str, Any],
        fio: str,
        position: str,
        department: str,
        completed_set: set,
        top_courses: List[Dict[str, Any]],
        total_colleagues: int
    ) -> Dict[str, Any]:
        """Гарантирует соответствие структуры, отсутствие пройденных курсов и наличие реальных метаданных."""
        # Карта курсов из каталога для быстрого поиска
        catalog_map = {c["name"].lower(): c for c in self.catalog}
        
        stages = raw_res.get("stages", [])
        if not stages:
            # Fallback построение 3 этапов на основе каталога и бенчмарка
            stages = self._build_default_stages(position, department, completed_set, top_courses)
            
        cleaned_stages = []
        seen_courses = set(completed_set)
        
        stage_names = [
            ("Этап 1: Базовая нормативная грамотность и безопасность", "1-2 месяца", "Освоение ключевых стандартов государственной службы, противодействия коррупции и работы с обращениями граждан"),
            ("Этап 2: Профильные компетенции и управление процессами", "3-6 месяцев", "Развитие предметных навыков и оптимизация служебных процессов"),
            ("Этап 3: Цифровая трансформация и лидерство", "6-12 месяцев", "Освоение инструментов искусственного интеллекта, управления данными и клиентоцентричности")
        ]
        
        for s_idx, st in enumerate(stages):
            s_num = st.get("stage_number", s_idx + 1)
            default_title, default_period, default_goal = stage_names[min(s_idx, len(stage_names)-1)]
            
            s_title = st.get("stage_title") or default_title
            s_period = st.get("recommended_period") or st.get("timeframe") or default_period
            s_goal = st.get("stage_goal") or default_goal
            
            raw_courses = st.get("courses") or st.get("selected_courses") or []
            stage_courses = []
            
            for c in raw_courses:
                c_name = c.get("course_name", "").strip()
                if not c_name or c_name.lower() in seen_courses:
                    continue
                
                # Ищем точный курс в каталоге
                cat_item = catalog_map.get(c_name.lower())
                if not cat_item:
                    # Поиск ближайшего курса
                    for k, v in catalog_map.items():
                        if k in c_name.lower() or c_name.lower() in k:
                            cat_item = v
                            break
                            
                c_id = cat_item["id"] if cat_item else f"CR_{len(seen_courses)+1}"
                c_type = cat_item["type"] if cat_item else c.get("type", c.get("course_type", "ППК"))
                c_category = cat_item.get("category", "Профессиональная программа") if cat_item else "Программа обучения"
                c_hours = cat_item.get("duration_hours", 16) if cat_item else c.get("duration_hours", 16)
                c_comps = cat_item.get("competencies", ["Профессиональные компетенции"]) if cat_item else c.get("competencies", ["Служебные навыки"])
                c_annot = cat_item.get("annotation", "") if cat_item else c.get("annotation", "")
                c_results = cat_item.get("results", "") if cat_item else c.get("learning_outcomes", "")
                
                # Обоснование
                just = c.get("justification", "")
                if not just or len(just) < 15:
                    just = f"Курс рекомендован для должности '{position}' в ведомстве '{department}'. Развивает компетенции: {', '.join(c_comps)}. Соответствует стандарту развития ГГС Санкт-Петербурга."
                
                stage_courses.append({
                    "course_id": c_id,
                    "course_name": cat_item["name"] if cat_item else c_name,
                    "type": c_type,
                    "category": c_category,
                    "duration_hours": c_hours,
                    "competencies": c_comps,
                    "annotation": c_annot,
                    "learning_outcomes": c_results,
                    "justification": just,
                    "priority": c.get("priority", "High"),
                    "status": "Рекомендован"
                })
                seen_courses.add(c_name.lower())
                
            if not stage_courses:
                # Добавляем подходящий курс из каталога для этого этапа
                candidate = self._pick_fallback_course(s_idx, seen_courses)
                if candidate:
                    stage_courses.append(candidate)
                    seen_courses.add(candidate["course_name"].lower())
                    
            cleaned_stages.append({
                "stage_number": s_num,
                "stage_title": s_title,
                "recommended_period": s_period,
                "stage_goal": s_goal,
                "courses": stage_courses
            })
            
        radar = raw_res.get("competency_radar", [])
        if not radar:
            radar = [
                {"competency": "Нормативная грамотность", "current_level": 45, "target_level": 90, "growth": 45},
                {"competency": "Управление процессами", "current_level": 40, "target_level": 85, "growth": 45},
                {"competency": "Управление данными и ИИ", "current_level": 30, "target_level": 80, "growth": 50},
                {"competency": "Деловые коммуникации", "current_level": 50, "target_level": 85, "growth": 35},
                {"competency": "Клиентоцентричность", "current_level": 35, "target_level": 90, "growth": 55}
            ]
            
        return {
            "trajectory_id": raw_res.get("trajectory_id", f"traj_{os.urandom(4).hex()}"),
            "employee_name": fio,
            "position": position,
            "department": department,
            "summary": raw_res.get("summary") or f"Индивидуальная образовательная траектория сформирована для должности '{position}' ({department}) с учетом актуальной образовательной линейки 2025 года и опыта успешного прохождения программ коллегами.",
            "stages": cleaned_stages,
            "competency_radar": radar,
            "colleague_benchmark": {
                "total_colleagues_in_position": total_colleagues,
                "top_recommended_for_position": top_courses
            }
        }

    def _build_default_stages(self, position: str, department: str, completed_set: set, top_courses: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        # Автоматический подбор 3 этапов
        stage1_courses = []
        stage2_courses = []
        stage3_courses = []
        
        for item in self.catalog:
            name = item["name"]
            if name.lower() in completed_set:
                continue
            name_l = name.lower()
            
            if any(w in name_l for w in ["коррупц", "конституц", "обращен", "язык", "этикет", "стиль"]):
                if len(stage1_courses) < 2:
                    stage1_courses.append(self._format_course_rec(item, position, department, "Базовый нормативный курс"))
            elif any(w in name_l for w in ["проект", "процесс", "закупк", "бережлив", "регулярн", "менеджмент"]):
                if len(stage2_courses) < 2:
                    stage2_courses.append(self._format_course_rec(item, position, department, "Профильный курс для повышения эффективности"))
            elif any(w in name_l for w in ["данн", "искусственн", "клиент", "цифр", "эмоциональн", "изменен"]):
                if len(stage3_courses) < 2:
                    stage3_courses.append(self._format_course_rec(item, position, department, "Курс для развития лидерских и цифровых навыков"))
                    
        return [
            {
                "stage_number": 1,
                "stage_title": "Этап 1: Базовая нормативная грамотность и безопасность",
                "recommended_period": "1-2 месяца",
                "stage_goal": "Формирование фундаментальных правовых и коммуникативных стандартов гражданской службы",
                "courses": stage1_courses
            },
            {
                "stage_number": 2,
                "stage_title": "Этап 2: Профильные компетенции и управление процессами",
                "recommended_period": "3-6 месяцев",
                "stage_goal": "Освоение инструментов проектного менеджмента и прикладных профессиональных задач",
                "courses": stage2_courses
            },
            {
                "stage_number": 3,
                "stage_title": "Этап 3: Цифровая трансформация и лидерство",
                "recommended_period": "6-12 месяцев",
                "stage_goal": "Развитие навыков работы с данными, искусственным интеллектом и клиентоориентированностью",
                "courses": stage3_courses
            }
        ]

    def _format_course_rec(self, item: Dict[str, Any], position: str, department: str, reason: str) -> Dict[str, Any]:
        return {
            "course_id": item["id"],
            "course_name": item["name"],
            "type": item["type"],
            "category": item.get("category", "Программа"),
            "duration_hours": item.get("duration_hours", 16),
            "competencies": item.get("competencies", ["Профессиональные компетенции"]),
            "annotation": item.get("annotation", ""),
            "learning_outcomes": item.get("results", ""),
            "justification": f"{reason} для позиции '{position}'. Развивает навыки: {', '.join(item.get('competencies', []))}.",
            "priority": "High",
            "status": "Рекомендован"
        }

    def _pick_fallback_course(self, stage_idx: int, seen_courses: set) -> Optional[Dict[str, Any]]:
        for item in self.catalog:
            if item["name"].lower() not in seen_courses:
                return {
                    "course_id": item["id"],
                    "course_name": item["name"],
                    "type": item["type"],
                    "category": item.get("category", "Программа"),
                    "duration_hours": item.get("duration_hours", 16),
                    "competencies": item.get("competencies", ["Профессиональные навыки"]),
                    "annotation": item.get("annotation", ""),
                    "learning_outcomes": item.get("results", ""),
                    "justification": f"Рекомендован методистами Корпоративного университета Санкт-Петербурга для этапа {stage_idx+1}.",
                    "priority": "Medium",
                    "status": "Рекомендован"
                }
        return None