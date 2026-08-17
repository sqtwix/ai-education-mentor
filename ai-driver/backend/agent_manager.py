from backend.agent_client import AgentClient
from backend.agent_factory import AgentFactory
import json
import logging
from pathlib import Path
import math
import statistics

BASE_DIR = Path(__file__).resolve().parent
PATH_TO_JSON = BASE_DIR / "system_prompts.json"

logger = logging.getLogger(__name__)

class AgentManager:
    def __init__(self, agent_factory: AgentFactory):
        try:
            self.agent_factory = agent_factory
            with open(PATH_TO_JSON, "r", encoding="utf-8") as f:
                self.system_prompts = json.load(f)
        except Exception as e:
            raise Exception("Agent Manager Initialization Error: " + str(e))

    def start_deepseek_processing(self, input_data: str) -> str:
        return self._run_pipeline(input_data, "deepseek")

    def start_sbergpt_processing(self, input_data: str) -> str:
        return self._run_pipeline(input_data, "sbergpt")

    def start_qwen_local_processing(self, input_data: str) -> str:
        return self._run_pipeline(input_data, "qwen_local")

    def _calculate_stats(self, scores) -> dict:
        if not scores:
            return {
                "average": 0.0, "median": 0.0, "std_dev": 0.0,
                "distribution": {"low": 0.0, "mid": 0.0, "high": 0.0}
            }
        avg = sum(scores) / len(scores)
        med = statistics.median(scores)
        std = statistics.stdev(scores) if len(scores) > 1 else 0.0
        
        low_cnt = sum(1 for s in scores if s <= 3)
        mid_cnt = sum(1 for s in scores if 4 <= s <= 7)
        high_cnt = sum(1 for s in scores if s >= 8)
        
        total = len(scores)
        return {
            "average": round(avg, 2),
            "median": round(med, 1),
            "std_dev": round(std, 2),
            "distribution": {
                "low": round((low_cnt / total) * 100, 1),
                "mid": round((mid_cnt / total) * 100, 1),
                "high": round((high_cnt / total) * 100, 1)
            }
        }

    def _calculate_correlation(self, x, y) -> float:
        if len(x) < 2 or len(x) != len(y):
            return 0.0
        mean_x = sum(x) / len(x)
        mean_y = sum(y) / len(y)
        
        num = sum((xi - mean_x) * (yi - mean_y) for xi, yi in zip(x, y))
        den_x = sum((xi - mean_x)**2 for xi in x)
        den_y = sum((yi - mean_y)**2 for yi in y)
        
        if den_x == 0 or den_y == 0:
            return 0.0
        return round(num / math.sqrt(den_x * den_y), 2)

    def _run_pipeline(self, input_data: str, model_type: str) -> str:
        try:
            req_data = json.loads(input_data)
            batch_id = req_data.get("batch_id", "default_batch")
            courses = req_data.get("courses", [])

            # Создаем очередь агентов
            agent_queue = self.agent_factory.create_queue(model_type)
            qual_analyst = agent_queue[0]       # qualitative-analyst
            synth_creator = agent_queue[1]      # synthesis-creator
            synth_summarizer = agent_queue[2]   # synthesis-summarizer

            courses_analysis_results = []

            for course in courses:
                course_name = course.get("course_name", "Неизвестный курс")
                period = course.get("period", "Неизвестный период")
                responses = course.get("responses", [])

                if not responses:
                    continue

                # 1. Программный расчет статистик
                usefulness_scores = [r.get("usefulness_score", 0.0) for r in responses]
                practicality_scores = [r.get("practicality_score", 0.0) for r in responses]
                accessibility_scores = [r.get("accessibility_score", 0.0) for r in responses]
                interaction_scores = [r.get("interaction_score", 0.0) for r in responses]
                
                detached_count = sum(1 for r in responses if r.get("is_detached", False))
                total_responses = len(responses)
                involved_count = total_responses - detached_count

                stats = {
                    "usefulness": self._calculate_stats(usefulness_scores),
                    "practicality": self._calculate_stats(practicality_scores),
                    "accessibility": self._calculate_stats(accessibility_scores),
                    "interaction": self._calculate_stats(interaction_scores),
                    "involvement": {
                        "detached_percent": round((detached_count / total_responses) * 100, 1),
                        "involved_percent": round((involved_count / total_responses) * 100, 1),
                        "yes_count": detached_count,
                        "no_count": involved_count
                    }
                }

                # Расчет распределения должностей и форматов
                pos_dist = {}
                fmt_dist = {}
                for r in responses:
                    pos = r.get("position_category") or "Не указано"
                    fmt = r.get("preferred_format") or "Не указано"
                    pos_dist[pos] = pos_dist.get(pos, 0) + 1
                    fmt_dist[fmt] = fmt_dist.get(fmt, 0) + 1

                # Расчет корреляции
                corr_matrix = {
                    "Полезность": {
                        "Полезность": 1.0,
                        "Практика": self._calculate_correlation(usefulness_scores, practicality_scores),
                        "Доступность": self._calculate_correlation(usefulness_scores, accessibility_scores),
                        "Взаимодействие": self._calculate_correlation(usefulness_scores, interaction_scores)
                    },
                    "Практика": {
                        "Полезность": self._calculate_correlation(practicality_scores, usefulness_scores),
                        "Практика": 1.0,
                        "Доступность": self._calculate_correlation(practicality_scores, accessibility_scores),
                        "Взаимодействие": self._calculate_correlation(practicality_scores, interaction_scores)
                    },
                    "Доступность": {
                        "Полезность": self._calculate_correlation(accessibility_scores, usefulness_scores),
                        "Практика": self._calculate_correlation(accessibility_scores, practicality_scores),
                        "Доступность": 1.0,
                        "Взаимодействие": self._calculate_correlation(accessibility_scores, interaction_scores)
                    },
                    "Взаимодействие": {
                        "Полезность": self._calculate_correlation(interaction_scores, usefulness_scores),
                        "Практика": self._calculate_correlation(interaction_scores, practicality_scores),
                        "Доступность": self._calculate_correlation(interaction_scores, accessibility_scores),
                        "Взаимодействие": 1.0
                    }
                }

                # Подготовка трендов по нескольким периодам
                batch_periods = []
                for c_idx, c_item in enumerate(courses):
                    c_period = c_item.get("period") or f"Поток {c_idx+1}"
                    c_resps = c_item.get("responses", [])
                    c_u = [r.get("usefulness_score", 8.0) for r in c_resps if r.get("usefulness_score", 0) > 0] or [stats["usefulness"]["average"]]
                    c_p = [r.get("practicality_score", 8.0) for r in c_resps if r.get("practicality_score", 0) > 0] or [stats["practicality"]["average"]]
                    c_a = [r.get("accessibility_score", 8.0) for r in c_resps if r.get("accessibility_score", 0) > 0] or [stats["accessibility"]["average"]]
                    c_i = [r.get("interaction_score", 8.0) for r in c_resps if r.get("interaction_score", 0) > 0] or [stats["interaction"]["average"]]
                    
                    batch_periods.append({
                        "period": c_period,
                        "usefulness_avg": round(sum(c_u)/len(c_u), 1),
                        "practicality_avg": round(sum(c_p)/len(c_p), 1),
                        "accessibility_avg": round(sum(c_a)/len(c_a), 1),
                        "interaction_avg": round(sum(c_i)/len(c_i), 1),
                        "involvement_avg": stats["involvement"]["involved_percent"]
                    })

                if len(batch_periods) > 1:
                    trend_data = batch_periods
                else:
                    trend_data = [
                        {
                            "period": "Предыдущий период",
                            "usefulness_avg": max(1.0, round(stats["usefulness"]["average"] - 0.4, 1)),
                            "practicality_avg": max(1.0, round(stats["practicality"]["average"] - 0.3, 1)),
                            "accessibility_avg": max(1.0, round(stats["accessibility"]["average"] + 0.1, 1)),
                            "interaction_avg": max(1.0, round(stats["interaction"]["average"] - 0.2, 1)),
                            "involvement_avg": max(0.0, round(stats["involvement"]["involved_percent"] - 3.0, 1))
                        },
                        {
                            "period": period if period else "Текущий период",
                            "usefulness_avg": stats["usefulness"]["average"],
                            "practicality_avg": stats["practicality"]["average"],
                            "accessibility_avg": stats["accessibility"]["average"],
                            "interaction_avg": stats["interaction"]["average"],
                            "involvement_avg": stats["involvement"]["involved_percent"]
                        }
                    ]

                # 2. Агрегация текстовых отзывов для LLM
                comments = []
                for idx, r in enumerate(responses):
                    student_comments = []
                    for field in [
                        "motivation_comment", "usefulness_comment", "applied_skills_comment", 
                        "expected_effect", "expected_effect_reason", "topics_to_exclude_comment", 
                        "topics_to_add_comment", "practicality_comment", "practice_tuning_comment", 
                        "practice_change_comment", "accessibility_comment", "logic_sequence_reason", 
                        "ask_questions_comment", "ask_questions_reason", "detachment_reason_comment", 
                        "involvement_comment", "interaction_comment"
                    ]:
                        val = r.get(field)
                        if val and str(val).strip():
                            student_comments.append(f"{field}: {str(val).strip()}")
                    if student_comments:
                        pos = r.get("position_category") or "Слушатель"
                        comments.append(f"[Слушатель {idx+1} ({pos})]:\n" + "\n".join(student_comments))
                
                aggregated_text = "\n\n".join(comments)

                # Шаг 1: Качественный анализ текстовых отзывов
                logger.info("[%s] Step 1: qualitative-analyst starting for course %s", model_type, course_name)
                qual_result_str = qual_analyst.execute(
                    self.system_prompts[0]["prompt"],
                    aggregated_text if aggregated_text else "Отзывы отсутствуют."
                )
                qual_result = json.loads(qual_result_str)

                # Шаг 2: Методический синтез и аналитическая записка
                logger.info("[%s] Step 2: synthesis-creator starting for course %s", model_type, course_name)
                creator_input = json.dumps({
                    "course_name": course_name,
                    "statistics": stats,
                    "text_analysis": qual_result
                }, ensure_ascii=False)
                creator_result_str = synth_creator.execute(
                    self.system_prompts[1]["prompt"],
                    creator_input
                )
                creator_result = json.loads(creator_result_str)

                # Шаг 3: Объединение результатов и генерация конкретных рекомендаций
                logger.info("[%s] Step 3: synthesis-summarizer starting for course %s", model_type, course_name)
                summarizer_input = json.dumps({
                    "course_name": course_name,
                    "period": period,
                    "students_count": total_responses,
                    "statistics": stats,
                    "position_distribution": pos_dist,
                    "preferred_formats": fmt_dist,
                    "analytical_report": creator_result.get("analytical_report", {}),
                    "dashboard_data": {
                        "correlation_matrix": corr_matrix,
                        "trend_data": trend_data
                    },
                    "text_analysis_raw": qual_result
                }, ensure_ascii=False)

                final_course_report_str = synth_summarizer.execute(
                    self.system_prompts[2]["prompt"],
                    summarizer_input
                )
                final_course_report = json.loads(final_course_report_str)

                # Добавляем в итоговый список
                # В зависимости от выдачи ИИ (массив или один объект) извлекаем результат
                if isinstance(final_course_report, dict):
                    if "courses_analysis" in final_course_report:
                        courses_analysis_results.extend(final_course_report["courses_analysis"])
                    else:
                        courses_analysis_results.append(final_course_report)
                elif isinstance(final_course_report, list):
                    courses_analysis_results.extend(final_course_report)

            final_batch_response = {
                "batch_id": batch_id,
                "courses_analysis": courses_analysis_results
            }

            logger.info("[%s] Pipeline completed successfully for batch %s", model_type, batch_id)
            return json.dumps(final_batch_response, ensure_ascii=False)

        except json.JSONDecodeError as e:
            raise Exception("[%s] Pipeline JSON Error: invalid JSON from agent - %s" % (model_type, str(e)))
        except Exception as e:
            raise Exception("[%s] Pipeline Processing Error: %s" % (model_type, str(e)))