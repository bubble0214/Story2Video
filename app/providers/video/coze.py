from __future__ import annotations

import asyncio
import json
import logging
import os
import sys

from app.providers.image.coze import _get_coze_cli
from app.providers.video.base import BaseVideoProvider

logger = logging.getLogger(__name__)


class CozeVideoProvider(BaseVideoProvider):
    """Generate videos via the Coze CLI subprocess.

    Calls ``coze generate video create "prompt" --wait --format json`` and
    parses the JSON output to extract the video URL.  The PAT is injected
    through the ``COZE_API_KEY`` environment variable so that no prior
    ``coze auth login`` is required.
    """

    def __init__(
        self,
        api_key: str,
        base_url: str | None = None,
        billing_project_id: str | None = None,
        space_id: str | None = None,
    ) -> None:
        self._api_key = api_key
        self._base_url = (base_url or "https://api.coze.cn").rstrip("/")
        self._billing_project_id = billing_project_id
        self._space_id = space_id

    async def generate_video(self, prompt: str, **kwargs) -> str:
        """Run the Coze CLI to generate a video.

        Raises:
            RuntimeError: If the CLI exits with a non-zero status,
                the output cannot be parsed, or the generation did not succeed.
        """
        env = {
            "COZE_API_KEY": self._api_key,
            "COZE_BASE_URL": self._base_url,
        }
        if self._billing_project_id:
            env["COZE_BILLING_PROJECT_ID"] = self._billing_project_id
        if self._space_id:
            env["COZE_SPACE_ID"] = self._space_id

        cli_cmd = _get_coze_cli()

        # Map kwargs to CLI flags
        value_flags = [
            ("resolution", "--resolution"),
            ("ratio", "--ratio"),
            ("duration", "--duration"),
            ("first_frame", "--first-frame"),
            ("last_frame", "--last-frame"),
            ("seed", "--seed"),
        ]
        bool_flags = [
            ("no_watermark", "--no-watermark"),
            ("camerafixed", "--camerafixed"),
            ("no_generate_audio", "--no-generate-audio"),
        ]

        extra_args: list[str] = []
        for key, flag in value_flags:
            val = kwargs.get(key)
            if val is not None:
                extra_args.extend([flag, str(val)])
        for key, flag in bool_flags:
            if kwargs.get(key):
                extra_args.append(flag)

        if self._space_id:
            extra_args[0:0] = ["--space-id", self._space_id]

        # On Windows, npm-installed .cmd files must be run through a shell.
        use_shell = sys.platform == "win32" and cli_cmd.endswith(".cmd")

        if use_shell:
            escaped_prompt = prompt.replace('"', '\\"')
            flags_str = " ".join(
                f'"{a}"' if " " in a else a for a in extra_args
            )
            cmd_str = (
                f'"{cli_cmd}" generate video create "{escaped_prompt}"'
                f" {flags_str} --wait --format json"
            )
            logger.info(
                "Running Coze CLI (shell): %s (prompt truncated: %.60s…)",
                cmd_str, prompt,
            )
            proc = await asyncio.create_subprocess_shell(
                cmd_str,
                env={**os.environ, **env},
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        else:
            args = [
                cli_cmd, "generate", "video", "create", prompt,
                *extra_args,
                "--wait", "--format", "json",
            ]
            logger.info(
                "Running Coze CLI: %s (prompt truncated: %.60s…)",
                " ".join(args), prompt,
            )
            proc = await asyncio.create_subprocess_exec(
                *args,
                env=env,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=300)

        if proc.returncode != 0:
            err_text = stderr.decode("utf-8", errors="replace").strip()
            raise RuntimeError(
                f"Coze CLI exited with code {proc.returncode}: {err_text}"
            )

        output = stdout.decode("utf-8", errors="replace").strip()
        logger.info("Coze CLI output: %.200s", output)

        try:
            data = json.loads(output)
        except json.JSONDecodeError as exc:
            raise RuntimeError(
                f"Coze CLI output is not valid JSON: {exc}\nOutput: {output}"
            ) from exc

        # Coze video CLI returns:
        # {
        #   "task_id": "cgt-...",
        #   "response": {
        #       "status": "succeeded",
        #       "content": {"video_url": "...", ...}
        #   },
        #   ...
        # }
        try:
            resp = data["response"]
        except (KeyError, TypeError) as exc:
            raise RuntimeError(
                f"Coze CLI output missing 'response' field. "
                f"Data: {json.dumps(data, ensure_ascii=False)}"
            ) from exc

        status = resp.get("status")
        if status != "succeeded":
            raise RuntimeError(
                f"Video generation did not succeed. "
                f"status={status}, data: {json.dumps(data, ensure_ascii=False)}"
            )

        try:
            video_url = resp["content"]["video_url"]
        except (KeyError, TypeError) as exc:
            raise RuntimeError(
                f"Coze CLI output missing video_url field. "
                f"Data: {json.dumps(data, ensure_ascii=False)}"
            ) from exc

        if not video_url:
            raise RuntimeError(
                f"Coze CLI returned empty video_url. "
                f"Data: {json.dumps(data, ensure_ascii=False)}"
            )

        return video_url
