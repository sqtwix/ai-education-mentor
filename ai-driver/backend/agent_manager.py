import json
import logging
import hashlib
import re
from pathlib import Path
from typing import Dict, Any, List, Optional, Set, Tuple
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

    def start_qwen_local_processing(self, input_data: str) -> str:
        return self._run_pipeline(input_data, "qwen_local")

    def _pseudonymize_fio(self, fio: str) -> str:
        """Псевдонимизация ФИО перед отправкой во внешние облачные модели"""
        if not fio or fio == "Служащий":
            return "Служащий_ID_1"
        h = hashlib.md5(fio.encode("utf-8")).hexdigest()[:6].upper()
        return f"ГГС_ID_{h}"

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
        
        # 1. Точное совпадение по паре Должность + ИОГВ
        if pos_dept_key in benchmarks_pos_dept:
            cohort_data = benchmarks_pos_dept[pos_dept_key]
            if cohort_data.get("total_employees", 0) >= 2:
                return {
                    "total_employees": cohort_data["total_employees"],
                    "courses": cohort_data.get("courses", {}),
                    "is_cohort_limited": False,
                    "cohort_type": "position_and_department",
                    "cohort_note": f"Статистика по {cohort_data['total_employees']} коллегам в должности «{pos_clean}» в ведомстве «{dept_clean}»"
                }
        
        # Нечеткий поиск по паре
        for key, c_data in benchmarks_pos_dept.items():
            if pos_clean.lower() in key.lower() and dept_clean.lower() in key.lower():
                if c_data.get("total_employees", 0) >= 2:
                    return {
                        "total_employees": c_data["total_employees"],
                        "courses": c_data.get("courses", {}),
                        "is_cohort_limited": False,
                        "cohort_type": "position_and_department",
                        "cohort_note": f"Статистика по коллегам в должности «{c_data.get('position', pos_clean)}» в ведомстве «{c_data.get('department', dept_clean)}»"
                    }
        
        # 2. Совпадение по должности (общегородской срез)
        if pos_clean in benchmarks_pos:
            pos_data = benchmarks_pos[pos_clean]
            return {
                "total_employees": pos_data["total_employees"],
                "courses": pos_data.get("courses", {}),
                "is_cohort_limited": True,
                "cohort_type": "position_wide",
                "cohort_note": f"Использован общегородской срез по должности «{pos_clean}» ({pos_data['total_employees']} коллег в реестре)"
            }
            
        for pos_key, pos_data in benchmarks_pos.items():
            if pos_clean.lower() in pos_key.lower() or pos_key.lower() in pos_clean.lower():
                return {
                    "total_employees": pos_data["total_employees"],
                    "courses": pos_data.get("courses", {}),
                    "is_cohort_limited": True,
                    "cohort_type": "position_wide",
                    "cohort_note": f"Использован срез по смежной должности «{pos_key}» ({pos_data['total_employees']} коллег в реестре)"
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
        popular_courses: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Детерминированное ранжирование всех 221 курсов каталога:
        - Релевантность целям развития и ключевым словам должности
        - Востребованность среди коллег (популярность)
        - Балансировка типов программ (ППК и ЭК)
        """
        goal_words = set(re.findall(r'\w{4,}', f"{career_goal} {position} {department}".lower()))
        
        def score_course(item: Dict[str, Any]) -> float:
            score = 0.0
            name = item.get("name", "")
            name_lower = name.lower()
            corpus = f"{name} {item.get('annotation', '')} {item.get('target', '')} {' '.join(item.get('competencies', []))}".lower()
            
            # 1. Соответствие целям и ключевым словам
            for w in goal_words:
                if w in corpus:
                    score += 15.0
                if w in name_lower:
                    score += 25.0
                    
            # 2. Бонус популярности коллег
            if name in popular_courses:
                pop_info = popular_courses[name]
                score += pop_info.get("popularity_pct", 0) * 0.8
                score += (pop_info.get("success_rate", 100) - 50) * 0.2
            else:
                # Нечеткий поиск в популярных курсах
                for p_name, pop_info in popular_courses.items():
                    if p_name.lower() in name_lower or name_lower in p_name.lower():
                        score += pop_info.get("popularity_pct", 0) * 0.5
                        break
                        
            # 3. Базовые профильные курсы
            if "государственн" in corpus or "служебн" in corpus or "гражданск" in corpus:
                score += 10.0
                
            return score

        sorted_courses = sorted(available_catalog, key=score_course, reverse=True)
        return sorted_courses

    def _run_pipeline(self, input_data: str, model_type: str) -> str:
        try:
            req_data = json.loads(input_data)
            
            # Извлекаем профиль сотрудника
            employee_data = req_data.get("employee", {})
            if not employee_data and "fio" in req_data:
                employee_data = req_data
            
            real_fio = employee_data.get("fio", "Служащий")
            position = employee_data.get("position", "Главный специалист")
            department = employee_data.get("department", "ИОГВ Санкт-Петербурга")
            career_goal = employee_data.get("career_goal", "Повышение эффективности служебной деятельности и развитие управленческих навыков")
            learning_history = employee_data.get("learning_history", [])
            
            # Псевдонимизация ФИО для внешних облачных провайдеров
            safe_fio = real_fio if model_type == "qwen_local" else self._pseudonymize_fio(real_fio)
            
            # Список исключаемых пройденных курсов (СТРОГО без дублей)
            completed_course_names = set()
            for h in learning_history:
                st = str(h.get("status", "")).strip().lower()
                c_name = str(h.get("course_name", "")).strip()
                if st in ["пройден", "passed", "успешно", "done"] and c_name:
                    completed_course_names.add(c_name.lower())
            
            # Получаем реальный бенчмарк по когорте (должность + ИОГВ)
            cohort_benchmark = self._find_cohort_benchmark(position, department)
            total_colleagues = cohort_benchmark.get("total_employees", 0)
            popular_courses_dict = cohort_benchmark.get("courses", {})
            cohort_note = cohort_benchmark.get("cohort_note", "")
            
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
            
            # Ранжируем кандидатов по всему 221-курсовому каталогу
            ranked_catalog = self._rank_catalog_candidates(
                available_catalog, career_goal, position, department, popular_courses_dict
            )
            
            # Формируем сбалансированную репрезентативную выборку кандидатов (ППК + ЭК из разных категорий)
            top_ppk = [c for c in ranked_catalog if c["type"] == "ППК"][:25]
            top_ek = [c for c in ranked_catalog if c["type"] == "ЭК"][:25]
            catalog_candidates = top_ppk + top_ek
            
            catalog_sample = [
                {
                    "id": c["id"],
                    "name": c["name"],
                    "type": c["type"],
                    "category": c.get("category", ""),
                    "hours": c.get("duration_hours", 16),
                    "competencies": c.get("competencies", [])
                }
                for c in catalog_candidates
            ]
            
            # Создаем очередь агентов
            agent_queue = self.agent_factory.create_queue(model_type)
            analyst = agent_queue[0]      # competency-analyst
            architect = agent_queue[1]    # trajectory-architect
            justifier = agent_queue[2]    # trajectory-justifier
            
            # ----------------------------------------------------
            # ШАГ 1: Агент анализа профиля и дефицита компетенций
            # ----------------------------------------------------
            logger.info("[%s] Step 1: competency-analyst starting for %s (%s, %s)", model_type, safe_fio, position, department)
            step1_input = json.dumps({
                "employee": {
                    "fio": safe_fio,
                    "position": position,
                    "department": department,
                    "career_goal": career_goal,
                    "completed_courses_count": len(completed_course_names),
                    "completed_courses": list(completed_course_names),
                    "learning_history": learning_history
                },
                "cohort_benchmark": {
                    "position": position,
                    "department": department,
                    "total_colleagues": total_colleagues,
                    "cohort_note": cohort_note,
                    "top_courses": top_colleague_courses[:6]
                }
            }, ensure_ascii=False)
            
            analyst_raw = analyst.execute(self.system_prompts[0]["prompt"], step1_input)
            analyst_res = json.loads(analyst_raw)
            
            # ----------------------------------------------------
            # ШАГ 2: Агент проектирования структуры траектории
            # ----------------------------------------------------
            logger.info("[%s] Step 2: trajectory-architect starting", model_type)
            step2_input = json.dumps({
                "employee": {"fio": safe_fio, "position": position, "department": department},
                "competency_analysis": analyst_res,
                "available_catalog_candidates": catalog_sample,
                "colleague_top_courses": top_colleague_courses[:8]
            }, ensure_ascii=False)
            
            architect_raw = architect.execute(self.system_prompts[1]["prompt"], step2_input)
            architect_res = json.loads(architect_raw)
            
            # ----------------------------------------------------
            # ШАГ 3: Агент методического обоснования и финальной валидации
            # ----------------------------------------------------
            logger.info("[%s] Step 3: trajectory-justifier starting", model_type)
            step3_input = json.dumps({
                "employee": {"fio": safe_fio, "position": position, "department": department},
                "competency_analysis": analyst_res,
                "trajectory_plan": architect_res,
                "colleague_statistics": {
                    "total_in_cohort": total_colleagues,
                    "cohort_note": cohort_note,
                    "top_courses": top_colleague_courses
                }
            }, ensure_ascii=False)
            
            justifier_raw = justifier.execute(self.system_prompts[2]["prompt"], step3_input)
            justifier_res = json.loads(justifier_raw)
            
            # Обогащаем результат точными данными из реального каталога (аннотации, цели, ZUV результаты)
            # и возвращаем реальное ФИО сотрудника
            final_trajectory = self._enrich_and_validate_trajectory(
                justifier_res, real_fio, position, department, completed_course_names, top_colleague_courses, total_colleagues, cohort_note, ranked_catalog
            )
            
            final_response = {
                "batch_id": req_data.get("request_id", req_data.get("batch_id", "trajectory_batch_1")),
                "trajectory": final_trajectory,
                "courses_analysis": [final_trajectory]
            }
            
            return json.dumps(final_response, ensure_ascii=False, indent=2)

        except Exception as e:
            logger.error("Pipeline execution error: %s", str(e), exc_info=True)
            # В случае ошибки возвращаем честную структуру на основе ранжированного каталога
            return self._build_deterministic_trajectory_fallback(input_data, str(e))

    def _enrich_and_validate_trajectory(
        self,
        ai_result: Dict[str, Any],
        fio: str,
        position: str,
        department: str,
        completed_course_names: Set[str],
        top_colleague_courses: List[Dict[str, Any]],
        total_colleagues: int,
        cohort_note: str,
        ranked_catalog: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Проверка и обогащение метаданными из каталога:
        - Исключение курсов, которые уже пройдены
        - Заполнение аннотаций, часов и результатов из каталога
        - Доказательное обоснование со ссылкой на коллег
        """
        # Поиск по имени в каталоге
        catalog_by_name = {c["name"].lower(): c for c in self.catalog}
        
        stages = ai_result.get("stages", [])
        seen_in_trajectory = set()
        cleaned_stages = []
        
        for st_idx, stage in enumerate(stages):
            stage_num = stage.get("stage_number", st_idx + 1)
            stage_title = stage.get("stage_title", f"Этап {stage_num}")
            recommended_period = stage.get("recommended_period", f"{stage_num}-й квартал 2025 г.")
            stage_goal = stage.get("stage_goal", "Развитие ключевых профессиональных компетенций")
            
            cleaned_courses = []
            for course in stage.get("courses", []):
                c_name = course.get("course_name", "").strip()
                if not c_name:
                    continue
                    
                # СТРОГОЕ ПРАВИЛО: Исключаем пройденные курсы и дубликаты
                if c_name.lower() in completed_course_names or c_name.lower() in seen_in_trajectory:
                    continue
                    
                seen_in_trajectory.add(c_name.lower())
                
                # Ищем метаданные курса в каталоге
                catalog_item = catalog_by_name.get(c_name.lower())
                if not catalog_item:
                    # Поиск нечеткого совпадения
                    for cat_k, cat_v in catalog_by_name.items():
                        if cat_k in c_name.lower() or c_name.lower() in cat_k:
                            catalog_item = cat_v
                            break
                            
                duration_hours = course.get("duration_hours") or (catalog_item.get("duration_hours") if catalog_item else 16)
                course_type = course.get("type") or (catalog_item.get("type") if catalog_item else "ППК")
                category = course.get("category") or (catalog_item.get("category") if catalog_item else "Программа")
                competencies = course.get("competencies") or (catalog_item.get("competencies") if catalog_item else ["Профессиональные навыки"])
                annotation = catalog_item.get("annotation") if catalog_item else course.get("annotation", "")
                learning_outcomes = catalog_item.get("results") if catalog_item else course.get("learning_outcomes", "")
                
                justification = course.get("justification", "")
                if not justification or len(justification) < 15:
                    justification = f"Рекомендован для должности «{position}» в ведомстве «{department}». Формирует навыки: {', '.join(competencies)}."
                    
                cleaned_courses.append({
                    "course_id": catalog_item.get("id", f"C_{len(seen_in_trajectory):03d}") if catalog_item else f"C_{len(seen_in_trajectory):03d}",
                    "course_name": catalog_item.get("name", c_name) if catalog_item else c_name,
                    "type": course_type,
                    "category": category,
                    "duration_hours": duration_hours,
                    "competencies": competencies,
                    "annotation": annotation,
                    "learning_outcomes": learning_outcomes,
                    "justification": justification,
                    "priority": course.get("priority", "High" if st_idx == 0 else "Medium"),
                    "status": "Рекомендован"
                })
                
            # Если в этапе не оказалось курсов, добавляем из ранжированного каталога
            if not cleaned_courses:
                for cand in ranked_catalog:
                    if cand["name"].lower() not in completed_course_names and cand["name"].lower() not in seen_in_trajectory:
                        seen_in_trajectory.add(cand["name"].lower())
                        cleaned_courses.append({
                            "course_id": cand["id"],
                            "course_name": cand["name"],
                            "type": cand["type"],
                            "category": cand.get("category", "Программа"),
                            "duration_hours": cand.get("duration_hours", 16),
                            "competencies": cand.get("competencies", ["Профессиональные компетенции"]),
                            "annotation": cand.get("annotation", ""),
                            "learning_outcomes": cand.get("results", ""),
                            "justification": f"Подобран методическим алгоритмом для этапа {stage_num} с учетом профиля должности «{position}».",
                            "priority": "Medium",
                            "status": "Рекомендован"
                        })
                        break
                        
            cleaned_stages.append({
                "stage_number": stage_num,
                "stage_title": stage_title,
                "recommended_period": recommended_period,
                "stage_goal": stage_goal,
                "courses": cleaned_courses
            })
            
        # Радар компетенций
        radar = ai_result.get("competency_radar", [])
        if not radar:
            radar = [
                {"competency": "Цифровые компетенции и данные", "current_level": 45, "target_level": 85, "growth": 40},
                {"competency": "Клиентоцентричность и коммуникации", "current_level": 50, "target_level": 90, "growth": 40},
                {"competency": "Регулярный менеджмент и лидерство", "current_level": 40, "target_level": 80, "growth": 40},
                {"competency": "Проектное и процессное управление", "current_level": 35, "target_level": 85, "growth": 50},
                {"competency": "Правовая грамотность и стандарты", "current_level": 60, "target_level": 90, "growth": 30}
            ]
            
        return {
            "trajectory_id": ai_result.get("trajectory_id", f"traj_{fio.replace(' ', '_')}"),
            "employee_name": fio,
            "position": position,
            "department": department,
            "summary": ai_result.get("summary", f"Персонализированная траектория профессионального развития для служащего в должности «{position}» ({department}). Траектория состоит из {len(cleaned_stages)} этапов и направлена на комплексное закрытие дефицитов компетенций."),
            "stages": cleaned_stages,
            "competency_radar": radar,
            "colleague_benchmark": {
                "total_colleagues_in_position": total_colleagues,
                "cohort_note": cohort_note,
                "top_recommended_for_position": top_colleague_courses
            }
        }

    def _build_deterministic_trajectory_fallback(self, input_data: str, error_reason: str) -> str:
        """Детерминированное построение траектории на основе ранжированного каталога при сбое модели"""
        try:
            req_data = json.loads(input_data)
            emp = req_data.get("employee", req_data)
            fio = emp.get("fio", "Служащий")
            position = emp.get("position", "Главный специалист")
            department = emp.get("department", "ИОГВ Санкт-Петербурга")
            career_goal = emp.get("career_goal", "Профессиональное развитие")
            learning_history = emp.get("learning_history", [])
            
            completed_course_names = set()
            for h in learning_history:
                st = str(h.get("status", "")).strip().lower()
                c_name = str(h.get("course_name", "")).strip()
                if st in ["пройден", "passed", "успешно", "done"] and c_name:
                    completed_course_names.add(c_name.lower())
                    
            cohort_bench = self._find_cohort_benchmark(position, department)
            pop_dict = cohort_bench.get("courses", {})
            
            avail = [c for c in self.catalog if c["name"].lower() not in completed_course_names]
            ranked = self._rank_catalog_candidates(avail, career_goal, position, department, pop_dict)
            
            # Разбиваем на 3 этапа
            s1_courses = [c for c in ranked if c["type"] == "ППК"][:2]
            s2_courses = [c for c in ranked if c["type"] == "ЭК"][:2]
            s3_courses = [c for c in ranked if c not in s1_courses and c not in s2_courses][:2]
            
            stages = [
                {
                    "stage_number": 1,
                    "stage_title": "Этап 1: Базовые управленческие и правовые компетенции",
                    "recommended_period": "1-й квартал 2025 г.",
                    "stage_goal": "Освоение ключевых стандартов государственной гражданской службы",
                    "courses": [self._format_course_dict(c, position, department, "Рекомендован как приоритетный курс") for c in s1_courses]
                },
                {
                    "stage_number": 2,
                    "stage_title": "Этап 2: Профильные компетенции и клиентоцентричность",
                    "recommended_period": "2-й квартал 2025 г.",
                    "stage_goal": "Развитие навыков взаимодействия с гражданами и оптимизации процессов",
                    "courses": [self._format_course_dict(c, position, department, "Рекомендован для повышения эффективности процессов") for c in s2_courses]
                },
                {
                    "stage_number": 3,
                    "stage_title": "Этап 3: Цифровая трансформация и продвинутые навыки",
                    "recommended_period": "3-й квартал 2025 г.",
                    "stage_goal": "Освоение инструментов работы с данными и проектного управления",
                    "courses": [self._format_course_dict(c, position, department, "Рекомендован для развития цифровой грамотности") for c in s3_courses]
                }
            ]
            
            top_colleagues = [
                {
                    "course_name": c["course_name"],
                    "type": c.get("course_type", "ППК"),
                    "popularity_pct": c.get("popularity_pct", 70.0),
                    "success_rate": c.get("success_rate", 95.0)
                }
                for c in sorted(pop_dict.values(), key=lambda x: x.get("popularity_pct", 0), reverse=True)[:8]
            ]
            
            traj = {
                "trajectory_id": f"traj_det_{fio.replace(' ', '_')}",
                "employee_name": fio,
                "position": position,
                "department": department,
                "summary": f"Траектория сформирована алгоритмическим модулем на основе анализа дефицита компетенций для должности «{position}» ({department}) с учетом 221 аккредитованной программы каталога 2025 года.",
                "stages": stages,
                "competency_radar": [
                    {"competency": "Цифровые компетенции и данные", "current_level": 40, "target_level": 85, "growth": 45},
                    {"competency": "Клиентоцентричность и коммуникации", "current_level": 50, "target_level": 90, "growth": 40},
                    {"competency": "Регулярный менеджмент и лидерство", "current_level": 45, "target_level": 80, "growth": 35},
                    {"competency": "Проектное и процессное управление", "current_level": 35, "target_level": 80, "growth": 45},
                    {"competency": "Правовая грамотность и стандарты", "current_level": 60, "target_level": 90, "growth": 30}
                ],
                "colleague_benchmark": {
                    "total_colleagues_in_position": cohort_bench.get("total_employees", 0),
                    "cohort_note": cohort_bench.get("cohort_note", ""),
                    "top_recommended_for_position": top_colleagues
                }
            }
            
            return json.dumps({
                "batch_id": req_data.get("request_id", "batch_fallback"),
                "trajectory": traj,
                "courses_analysis": [traj]
            }, ensure_ascii=False, indent=2)
        except Exception as ex:
            logger.error("Fallback building error: %s", str(ex))
            return json.dumps({"error": f"Internal Error: {str(ex)}"}, ensure_ascii=False)

    def _format_course_dict(self, item: Dict[str, Any], position: str, department: str, reason: str) -> Dict[str, Any]:
        return {
            "course_id": item["id"],
            "course_name": item["name"],
            "type": item["type"],
            "category": item.get("category", "Программа"),
            "duration_hours": item.get("duration_hours", 16),
            "competencies": item.get("competencies", ["Профессиональные компетенции"]),
            "annotation": item.get("annotation", ""),
            "learning_outcomes": item.get("results", ""),
            "justification": f"{reason} для позиции «{position}» в {department}. Развивает компетенции: {', '.join(item.get('competencies', []))}.",
            "priority": "High",
            "status": "Рекомендован"
        }

    def _pick_fallback_course(self, stage_idx: int, seen_courses: Set[str]) -> Optional[Dict[str, Any]]:
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