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

def clean_program_title(raw_title: str) -> str:
    t = str(raw_title).strip()
    t = re.sub(r'^\d+[\.\)]\s*', '', t)
    t = re.sub(r'\s+', ' ', t)
    
    # Исправление специфических обрывов из буклета
    if "ГОСУДАРСТВЕННОГО УПРАВЛЕНИЯ САНКТ -ПЕТЕРБУРГА" in t.upper():
        return "Современные стандарты государственного управления в Санкт-Петербурге"
    if "через совершенствование" in t.lower():
        return "Совершенствование системы государственного управления Санкт-Петербурга"
    if "В рамках обучения" in t:
        return "Цифровые инструменты государственного и муниципального управления Санкт-Петербурга"
    
    # Приведение регистра
    if t.isupper() and len(t) > 5:
        t = t.capitalize()
    else:
        t = t[0].upper() + t[1:] if len(t) > 1 else t.upper()
        
    # Удаление обрывков в конце
    t = re.sub(r'[\s,\.:;–—-]+$', '', t)
    t = re.sub(r'\s+(через|в|на|и|по|для|от|с|к|о|при)$', '', t, flags=re.IGNORECASE)
    return t

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
                
        lines = [line.strip() for line in full_text.splitlines() if line.strip()]
        for line in lines:
            if (len(line) > 18 and len(line) < 130 and 
                not line.startswith("Стр") and not line.startswith("Линейка") and 
                not line.startswith("2025") and not line.startswith("Корпоративный") and
                not line.isdigit()):
                
                clean_title = clean_program_title(line)
                
                if (clean_title.lower() not in seen_names and 
                    len(clean_title) >= 15 and
                    any(k in clean_title.lower() for k in ["управлен", "развит", "навык", "практик", "основ", "государственн", "эффективност", "анализ", "технолог", "цифров", "лидерств", "культур", "коммуникац", "проект", "служебн", "делопроизвод", "контрол"])):
                    
                    seen_names.add(clean_title.lower())
                    
                    competencies = []
                    t_lower = clean_title.lower()
                    if "цифр" in t_lower or "данн" in t_lower or "ии" in t_lower or "ит" in t_lower:
                        competencies.append("Цифровая трансформация и данные")
                    if "клиент" in t_lower or "сервис" in t_lower or "обращен" in t_lower:
                        competencies.append("Клиентоцентричность и взаимодействие с гражданами")
                    if "управлен" in t_lower or "руковод" in t_lower or "лидер" in t_lower:
                        competencies.append("Лидерство и регулярный менеджмент")
                    if "проект" in t_lower or "процесс" in t_lower or "бережлив" in t_lower:
                        competencies.append("Проектное и процессное управление")
                    if "коммуник" in t_lower or "переговор" in t_lower or "конфликт" in t_lower:
                        competencies.append("Деловые коммуникации и аргументация")
                    if "право" in t_lower or "закон" in t_lower or "норм" in t_lower or "коррупц" in t_lower or "служебн" in t_lower:
                        competencies.append("Правовая грамотность и стандарты ГГС")
                    if not competencies:
                        competencies = ["Профессиональное развитие ГГС"]
                        
                    courses.append({
                        "id": f"PPK_{course_id_counter:03d}",
                        "name": clean_title,
                        "type": "ППК",
                        "category": "Программа повышения квалификации",
                        "duration_hours": 24 if "практикум" in clean_title.lower() else (36 if "интенсив" in clean_title.lower() else 16),
                        "annotation": f"Практико-ориентированная программа повышения квалификации Корпоративного университета Санкт-Петербурга по теме: «{clean_title}».",
                        "target": f"Развитие профессиональных и управленческих компетенций гражданских служащих в сфере: {clean_title}.",
                        "results": f"Знать ключевые стандарты и нормативно-правовую базу; Уметь применять практические инструменты в служебной деятельности; Владеть навыками эффективного решения типовых и комплексных задач по теме «{clean_title}».",
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
                c_type_str = str(c_type).strip() if c_type else "ППК"
                c_name_str = clean_program_title(str(c_name).strip())
                status_str = str(status).strip() if status else "Пройден"
                
                if fio_str not in users_dict:
                    users_dict[fio_str] = {
                        "fio": fio_str,
                        "position": pos_str,
                        "department": dept_str,
                        "experience_years": 3,
                        "career_goal": f"Повышение профессионального мастерства и эффективности для должности «{pos_str}»",
                        "learning_history": []
                    }
                
                users_dict[fio_str]["learning_history"].append({
                    "course_name": c_name_str,
                    "course_type": c_type_str,
                    "status": status_str
                })

    # 1. Бенчмарки по должности (общегородские)
    pos_stats = {}
    for u in users_dict.values():
        p = u["position"]
        if p not in pos_stats:
            pos_stats[p] = {"total_employees": 0, "course_counts": {}, "course_passed": {}, "course_types": {}}
        pos_stats[p]["total_employees"] += 1
        
        for h in u["learning_history"]:
            cname = h["course_name"]
            ctype = h["course_type"]
            st = h["status"].lower()
            
            pos_stats[p]["course_counts"][cname] = pos_stats[p]["course_counts"].get(cname, 0) + 1
            pos_stats[p]["course_types"][cname] = ctype
            if st in ["пройден", "успешно", "passed", "done"]:
                pos_stats[p]["course_passed"][cname] = pos_stats[p]["course_passed"].get(cname, 0) + 1

    benchmarks_by_pos = {}
    for p, data in pos_stats.items():
        tot = data["total_employees"]
        c_bench = {}
        for cname, count in data["course_counts"].items():
            passed = data["course_passed"].get(cname, 0)
            c_bench[cname] = {
                "course_name": cname,
                "course_type": data["course_types"].get(cname, "ППК"),
                "total_taken": count,
                "total_passed": passed,
                "popularity_pct": round((count / tot) * 100, 1) if tot > 0 else 0,
                "success_rate": round((passed / count) * 100, 1) if count > 0 else 100.0
            }
        benchmarks_by_pos[p] = {
            "position": p,
            "total_employees": tot,
            "courses": c_bench
        }

    # 2. Бенчмарки по паре (Должность + ИОГВ)
    pos_dept_stats = {}
    for u in users_dict.values():
        pair_key = f"{u['position']}___{u['department']}"
        if pair_key not in pos_dept_stats:
            pos_dept_stats[pair_key] = {
                "position": u["position"],
                "department": u["department"],
                "total_employees": 0, 
                "course_counts": {}, 
                "course_passed": {}, 
                "course_types": {}
            }
        pos_dept_stats[pair_key]["total_employees"] += 1
        
        for h in u["learning_history"]:
            cname = h["course_name"]
            ctype = h["course_type"]
            st = h["status"].lower()
            
            pos_dept_stats[pair_key]["course_counts"][cname] = pos_dept_stats[pair_key]["course_counts"].get(cname, 0) + 1
            pos_dept_stats[pair_key]["course_types"][cname] = ctype
            if st in ["пройден", "успешно", "passed", "done"]:
                pos_dept_stats[pair_key]["course_passed"][cname] = pos_dept_stats[pair_key]["course_passed"].get(cname, 0) + 1

    benchmarks_by_pos_dept = {}
    for pair_key, data in pos_dept_stats.items():
        tot = data["total_employees"]
        c_bench = {}
        for cname, count in data["course_counts"].items():
            passed = data["course_passed"].get(cname, 0)
            c_bench[cname] = {
                "course_name": cname,
                "course_type": data["course_types"].get(cname, "ППК"),
                "total_taken": count,
                "total_passed": passed,
                "popularity_pct": round((count / tot) * 100, 1) if tot > 0 else 0,
                "success_rate": round((passed / count) * 100, 1) if count > 0 else 100.0
            }
        benchmarks_by_pos_dept[pair_key] = {
            "position": data["position"],
            "department": data["department"],
            "total_employees": tot,
            "courses": c_bench
        }

    return {
        "users": list(users_dict.values()),
        "total_records": total_records,
        "benchmarks_by_position": benchmarks_by_pos,
        "benchmarks_by_position_and_dept": benchmarks_by_pos_dept
    }

if __name__ == "__main__":
    print("1. Building clean catalog...")
    catalog = build_catalog()
    print(f"   --> Total catalog courses: {len(catalog)}")
    
    print("2. Building clean learning history & benchmarks...")
    history_data = build_history_and_benchmarks()
    print(f"   --> Total training records: {history_data['total_records']}")
    print(f"   --> Total users/profiles:   {len(history_data['users'])}")
    print(f"   --> Positions with benchmark: {len(history_data['benchmarks_by_position'])}")
    print(f"   --> Position+Dept pairs:      {len(history_data['benchmarks_by_position_and_dept'])}")

    # Сохраняем в оба сервиса
    for target_dir in [AI_DRIVER_DATA, API_CORE_DATA]:
        with open(target_dir / "courses_catalog.json", "w", encoding="utf-8") as f:
            json.dump(catalog, f, ensure_ascii=False, indent=2)
            
        with open(target_dir / "learning_history_dataset.json", "w", encoding="utf-8") as f:
            json.dump(history_data, f, ensure_ascii=False, indent=2)
            
    print("[SUCCESS] Datasets saved cleanly to ai-driver and api-core!")
