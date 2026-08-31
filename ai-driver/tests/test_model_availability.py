import json
import unittest
from unittest.mock import MagicMock, patch

from backend.model_availability import (
    get_model_availability,
    local_llm_ready,
    verify_local_inference,
)


def response_with(payload: dict) -> MagicMock:
    response = MagicMock()
    response.status = 200
    response.read.return_value = json.dumps(payload).encode("utf-8")
    response.__enter__.return_value = response
    return response


class LocalModelAvailabilityTests(unittest.TestCase):
    @patch("backend.model_availability.urllib.request.urlopen")
    @patch.dict("os.environ", {"ENABLE_LOCAL_LLM": "false"}, clear=True)
    def test_disabled_local_model_does_not_probe_endpoint(self, urlopen_mock):
        self.assertFalse(local_llm_ready())
        urlopen_mock.assert_not_called()

    @patch("backend.model_availability.urllib.request.urlopen")
    @patch.dict(
        "os.environ",
        {
            "ENABLE_LOCAL_LLM": "true",
            "LOCAL_LLM_MODE": "external",
            "LOCAL_LLM_BASE_URL": "http://model-server:1234/v1",
            "LOCAL_LLM_MODEL": "custom-chat-model",
            "LOCAL_LLM_API_KEY": "secret-test-key",
        },
        clear=True,
    )
    def test_external_openai_endpoint_is_reported_without_exposing_key(self, urlopen_mock):
        urlopen_mock.return_value = response_with({"data": [{"id": "custom-chat-model"}]})

        availability = get_model_availability()
        local = next(item for item in availability["models"] if item["id"] == "local_llm")

        self.assertTrue(local["configured"])
        self.assertEqual(local["mode"], "external")
        self.assertEqual(local["model"], "custom-chat-model")
        self.assertNotIn("secret-test-key", json.dumps(availability))
        request = urlopen_mock.call_args.args[0]
        self.assertEqual(request.headers["Authorization"], "Bearer secret-test-key")

    @patch("backend.model_availability.urllib.request.urlopen")
    @patch.dict(
        "os.environ",
        {
            "ENABLE_LOCAL_LLM": "true",
            "LOCAL_LLM_MODE": "managed",
            "LOCAL_LLM_MODEL": "local-model",
        },
        clear=True,
    )
    def test_deploy_probe_requires_real_chat_content(self, urlopen_mock):
        urlopen_mock.side_effect = [
            response_with({"data": [{"id": "local-model"}]}),
            response_with({"choices": [{"message": {"content": "OK"}}]}),
        ]

        self.assertTrue(verify_local_inference())
        chat_request = urlopen_mock.call_args.args[0]
        self.assertEqual(chat_request.full_url, "http://local-llm:8080/v1/chat/completions")


if __name__ == "__main__":
    unittest.main()
