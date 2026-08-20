import json
import re
from pathlib import Path
import openpyxl
import pypdf

BASE_DIR = Path(__file__).resolve().parent.parent
EXAMPLE_DIR = BASE_DIR / "example_files"
AI_DRIVER_DATA = BASE_DIR / "ai-driver" / "backend" / "data"
API_CORE_DATA = BASE_DIR / "api-core" / "ApiCore" / "ApiCore" / "Data"

AI_DRIVER_DATA.mkdir(parents=True, exist_ok=True)
API_CORE_DATA.mkdir(parents=True, exist_ok=True)

def build_catalog():
    courses = []
    seen_names = set()
    course_id_counter = 1

    # 1. Реестр электронных курсов (ЭК)
    ek_path = EXAMPLE_DIR / "Реестр электронных курсов.xlsx"
    if ek_path.exists():
        wb = openpyxl.load_workbook(ek_path, data_only=True)
        ws = wb.active
        for row_idx in range(2, ws.max_row + 1):
            name = ws.cell(row_idx, 1).value
            annot = ws.cell(row_idx, 2).value or ""
            target = ws.cell(row_idx, 3).value or ""
            results = ws.cell(row_idx, 4).value or ""
            
            if name and str(name).strip():
                clean_name = str(name).strip()
                if clean_name.lower() not in seen_names:
                    seen_names.add(clean_name.lower())
                    
                    # Извлекаем компетенции из текста
                    competencies = []
                    text_corpus = f"{clean_name} {annot} {target} {results}".lower()
                    if "цифр" in text_corpus or "данн" in text_corpus or "ии" in text_corpus or "информ" in text_corpus:
                        competencies.append("Цифровая грамотность и управление данными")
                    if "коммуник" in text_corpus or "обращен" in text_corpus or "клиент" in text_corpus:
                        competencies.append("Клиентоцентричность и коммуникации")
                    if "управлен" in text_corpus or "менедж" in text_corpus or "лидер" in text_corpus:
                        competencies.append("Лидерство и регулярный менеджмент")
                    if "право" in text_corpus or "закон" in text_corpus or "норм" in text_corpus or "коррупц" in text_corpus:
                        competencies.append("Правовая грамотность и антикоррупционные стандарты")
                    if "проект" in text_corpus or "процесс" in text_corpus:
                        competencies.append("Проектное и процессное управление")
                    if "эмоцион" in text_corpus or "стресс" in text_corpus or "тайм" in text_corpus or "эффективн" in text_corpus:
                        competencies.append("Личная эффективность и эмоциональный интеллект")
                    if not competencies:
                        competencies = ["Профессиональные компетенции ГГС"]
                        
                    courses.append({
                        "id": f"EK_{course_id_counter:03d}",
                        "name": clean_name,
                        "type": "ЭК",
                        "category": "Электронный курс",
                        "duration_hours": 16,
                        "annotation": str(annot).strip(),
                        "target": str(target).strip(),
                        "results": str(results).strip(),
                        "competencies": competencies
                    })
                    course_id_counter += 1

    # 2. Буклет ППК 2025
    booklet_path = EXAMPLE_DIR / "Буклет Линейка программ на 2025 (2).pdf"
    if booklet_path.exists():
        reader = pypdf.PdfReader(booklet_path)
        full_text = ""
        for p in reader.pages:
            t = p.extract_text()
            if t:
                full_text += "\n" + t
                
        # Извлекаем названия программ из буклета
        lines = [line.strip() for line in full_text.splitlines() if line.strip()]
        for line in lines:
            if (len(line) > 15 and len(line) < 140 and 
                not line.startswith("Стр") and not line.startswith("Линейка") and 
                not line.startswith("2025") and not line.startswith("Корпоративный") and
                not line.isdigit()):
                
                # Проверяем, похоже ли на название образовательной программы
                clean_line = line
                if clean_line.lower() not in seen_names and any(k in clean_line.lower() for k in ["управление", "развитие", "навык", "практика", "основы", "государственн", "эффективност", "анализ", "технологии", "цифров", "лидерств", "культура", "коммуникац", "проект"]):
                    seen_names.add(clean_line.lower())
                    
                    competencies = []
                    t_lower = clean_line.lower()
                    if "цифр" in t_lower or "данн" in t_lower or "ии" in t_lower or "ит" in t_lower:
                        competencies.append("Цифровая трансформация и ИТ")
                    if "клиент" in t_lower or "сервис" in t_lower:
                        competencies.append("Клиентоцентричность")
                    if "управлен" in t_lower or "руковод" in t_lower or "лидер" in t_lower:
                        competencies.append("Управленческое мастерство")
                    if "проект" in t_lower or "процесс" in t_lower:
                        competencies.append("Управление проектами и процессами")
                    if "коммуник" in t_lower or "переговор" in t_lower:
                        competencies.append("Деловые коммуникации и аргументация")
                    if not competencies:
                        competencies = ["Профессиональное развитие ГГС"]
                        
                    courses.append({
                        "id": f"PPK_{course_id_counter:03d}",
                        "name": clean_line,
                        "type": "ППК",
                        "category": "Программа повышения квалификации",
                        "duration_hours": 24 if "практикум" in clean_line.lower() else (36 if "интенсив" in clean_line.lower() else 16),
                        "annotation": f"Практико-ориентированная программа повышения квалификации по теме: {clean_line}.",
                        "target": f"Развитие профессиональных компетенций гражданских служащих в области: {clean_line}.",
                        "results": f"Знать ключевые принципы и нормативную базу; Уметь применять практические инструменты в служебной деятельности; Владеть навыками решения типовых и нестандартных задач по теме {clean_line}.",
                        "competencies": competencies
                    })
                    course_id_counter += 1

    return courses

def build_history_and_benchmarks():
    history_path = EXAMPLE_DIR / "выгрузка с историей обучения.xlsx"
    users_dict = {}
    total_records = 0
    
    if history_path.exists():
        wb = openpyxl.load_workbook(history_path, data_only=True)
        ws = wb["ГГС 2024-2025"]
        
        for r in range(2, ws.max_row + 1):
            fio = ws.cell(r, 1).value
            pos = ws.cell(r, 2).value
            dept = ws.cell(r, 3).value
            c_type = ws.cell(r, 4).value
            c_name = ws.cell(r, 5).value
            status = ws.cell(r, 6).value
            
            if fio and pos and c_name:
                total_records += 1
                fio_str = str(fio).strip()
                pos_str = str(pos).strip()
                dept_str = str(dept).strip() if dept else "ИОГВ Санкт-Петербурга"
                c_name_str = str(c_name).strip()
                c_type_str = str(c_type).strip() if c_type else "ППК"
                st_str = str(status).strip() if status else "Пройден"
                
                if fio_str not in users_dict:
                    users_dict[fio_str] = {
                        "fio": fio_str,
                        "position": pos_str,
                        "department": dept_str,
                        "learning_history": []
                    }
                    
                users_dict[fio_str]["learning_history"].append({
                    "course_name": c_name_str,
                    "course_type": c_type_str,
                    "status": st_str
                })

    users_list = list(users_dict.values())
    
    # Расчет бенчмарков по должностям (position) и парам (position + department)
    benchmarks_by_position = {}
    benchmarks_by_position_and_dept = {}
    
    for u in users_list:
        pos = u["position"]
        dept = u["department"]
        pos_dept_key = f"{pos}___{dept}"
        
        # 1. By Position
        if pos not in benchmarks_by_position:
            benchmarks_by_position[pos] = {
                "total_employees": 0,
                "total_records": 0,
                "courses": {}
            }
        benchmarks_by_position[pos]["total_employees"] += 1
        
        # 2. By Position & Dept
        if pos_dept_key not in benchmarks_by_position_and_dept:
            benchmarks_by_position_and_dept[pos_dept_key] = {
                "position": pos,
                "department": dept,
                "total_employees": 0,
                "total_records": 0,
                "courses": {}
            }
        benchmarks_by_position_and_dept[pos_dept_key]["total_employees"] += 1
        
        for h in u["learning_history"]:
            c_name = h["course_name"]
            c_type = h["course_type"]
            st = h["status"]
            
            # Position agg
            benchmarks_by_position[pos]["total_records"] += 1
            if c_name not in benchmarks_by_position[pos]["courses"]:
                benchmarks_by_position[pos]["courses"][c_name] = {
                    "course_name": c_name,
                    "course_type": c_type,
                    "total_taken": 0,
                    "passed": 0,
                    "failed": 0,
                    "in_progress": 0
                }
            benchmarks_by_position[pos]["courses"][c_name]["total_taken"] += 1
            if st.lower() in ["пройден", "passed", "успешно"]:
                benchmarks_by_position[pos]["courses"][c_name]["passed"] += 1
            elif st.lower() in ["не пройден", "failed"]:
                benchmarks_by_position[pos]["courses"][c_name]["failed"] += 1
            else:
                benchmarks_by_position[pos]["courses"][c_name]["in_progress"] += 1

            # Position & Dept agg
            benchmarks_by_position_and_dept[pos_dept_key]["total_records"] += 1
            if c_name not in benchmarks_by_position_and_dept[pos_dept_key]["courses"]:
                benchmarks_by_position_and_dept[pos_dept_key]["courses"][c_name] = {
                    "course_name": c_name,
                    "course_type": c_type,
                    "total_taken": 0,
                    "passed": 0,
                    "failed": 0,
                    "in_progress": 0
                }
            benchmarks_by_position_and_dept[pos_dept_key]["courses"][c_name]["total_taken"] += 1
            if st.lower() in ["пройден", "passed", "успешно"]:
                benchmarks_by_position_and_dept[pos_dept_key]["courses"][c_name]["passed"] += 1
            elif st.lower() in ["не пройден", "failed"]:
                benchmarks_by_position_and_dept[pos_dept_key]["courses"][c_name]["failed"] += 1
            else:
                benchmarks_by_position_and_dept[pos_dept_key]["courses"][c_name]["in_progress"] += 1

    # Подсчет процентов
    for pos, b_data in benchmarks_by_position.items():
        tot_emp = max(1, b_data["total_employees"])
        for c_name, c_data in b_data["courses"].items():
            c_data["popularity_pct"] = round((c_data["total_taken"] / tot_emp) * 100.0, 1)
            c_data["success_rate"] = round((c_data["passed"] / max(1, c_data["total_taken"])) * 100.0, 1)

    for p_d_key, b_data in benchmarks_by_position_and_dept.items():
        tot_emp = max(1, b_data["total_employees"])
        for c_name, c_data in b_data["courses"].items():
            c_data["popularity_pct"] = round((c_data["total_taken"] / tot_emp) * 100.0, 1)
            c_data["success_rate"] = round((c_data["passed"] / max(1, c_data["total_taken"])) * 100.0, 1)

    return {
        "users": users_list,
        "total_users": len(users_list),
        "total_records": total_records,
        "benchmarks_by_position": benchmarks_by_position,
        "benchmarks_by_position_and_dept": benchmarks_by_position_and_dept
    }

if __name__ == "__main__":
    catalog = build_catalog()
    history = build_history_and_benchmarks()
    
    print(f"Catalog courses built: {len(catalog)}")
    print(f"History dataset built: {history['total_users']} users, {history['total_records']} training records.")
    
    for folder in [AI_DRIVER_DATA, API_CORE_DATA]:
        with open(folder / "courses_catalog.json", "w", encoding="utf-8") as f:
            json.dump(catalog, f, ensure_ascii=False, indent=2)
        with open(folder / "learning_history_dataset.json", "w", encoding="utf-8") as f:
            json.dump(history, f, ensure_ascii=False, indent=2)
            
    print("Files successfully written to ai-driver and api-core!")
