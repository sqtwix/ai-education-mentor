import unittest

from main import app


class OpenApiContractTests(unittest.TestCase):
    def test_provider_routes_publish_trajectory_request_body(self):
        document = app.openapi()

        for provider in ("deepseek", "sbergpt", "qwen_local"):
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


if __name__ == "__main__":
    unittest.main()
