import unittest
from pydantic import ValidationError

from main import app
from schemas.trajectory_request import TrajectoryRequest


class OpenApiContractTests(unittest.TestCase):
    def test_provider_routes_publish_trajectory_request_body(self):
        document = app.openapi()

        for provider in ("deepseek", "sbergpt", "local_llm", "qwen_local"):
            operation = document["paths"][f"/agents/get_{provider}_data_analysis"]["post"]
            schema = operation["requestBody"]["content"]["application/json"]["schema"]
            self.assertEqual(schema["$ref"], "#/components/schemas/TrajectoryRequest")

    def test_trajectory_request_requires_employee_profile(self):
        document = app.openapi()
        request_schema = document["components"]["schemas"]["TrajectoryRequest"]
        employee_schema = document["components"]["schemas"]["EmployeeProfile"]

        self.assertIn("employee", request_schema["required"])
        self.assertIn("model_type", request_schema["properties"])
        self.assertEqual(
            set(employee_schema["required"]),
            {"fio", "position", "department", "career_goal"},
        )

    def test_progress_route_is_published(self):
        document = app.openapi()
        self.assertIn("/agents/progress/{request_id}", document["paths"])
        self.assertIn("get", document["paths"]["/agents/progress/{request_id}"])

    def test_trajectory_request_rejects_unbounded_or_invalid_profile_data(self):
        base_employee = {
            "fio": "Тестовый профиль",
            "position": "Главный специалист",
            "department": "Тестовое ведомство",
            "career_goal": "Развитие цифровых компетенций",
            "learning_history": [],
        }

        invalid_payloads = [
            {"request_id": "contains spaces", "employee": base_employee},
            {"employee": {**base_employee, "experience_years": -1}},
            {"employee": {**base_employee, "career_goal": "x" * 2001}},
            {
                "employee": {
                    **base_employee,
                    "learning_history": [
                        {"course_name": f"Курс {index}", "status": "Пройден"}
                        for index in range(201)
                    ],
                }
            },
        ]

        for payload in invalid_payloads:
            with self.subTest(payload=list(payload)):
                with self.assertRaises(ValidationError):
                    TrajectoryRequest.model_validate(payload)

    def test_trajectory_request_accepts_registry_profile_without_career_goal_value(self):
        request = TrajectoryRequest.model_validate({
            "employee": {
                "fio": "Пользователь 1",
                "position": "Главный специалист",
                "department": "Администрация Губернатора",
                "career_goal": "",
                "learning_history": [
                    {
                        "course_name": "Основы Конституции Российской Федерации",
                        "course_type": "ЭК",
                        "status": "Пройден",
                    }
                ],
            }
        })

        self.assertEqual(request.employee.career_goal, "")


if __name__ == "__main__":
    unittest.main()
