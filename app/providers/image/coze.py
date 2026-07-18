from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import sys

from app.providers.image.base import BaseImageProvider

logger = logging.getLogger(__name__)

_COZE_CLI_CMD: str | None = None  # resolved lazily


def _get_coze_cli() -> str:
    """Lazily locate the ``coze`` binary."""
    global _COZE_CLI_CMD
    if _COZE_CLI_CMD is not None:
        return _COZE_CLI_CMD
    cmd = shutil.which("coze.cmd") or shutil.which("coze")
    if cmd:
        _COZE_CLI_CMD = cmd
        return cmd
    # Fallback: common npm global locations
    candidates = [
        os.path.expanduser("~/AppData/Roaming/npm/coze.cmd"),
        os.path.expanduser("~/AppData/Roaming/npm/coze"),
        "/usr/local/bin/coze",
    ]
    for c in candidates:
        if os.path.isfile(c):
            _COZE_CLI_CMD = c
            return c
    raise FileNotFoundError(
        "Coze CLI binary not found. Install it with: npm install -g @coze/cli"
    )


class CozeImageProvider(BaseImageProvider):
    """Generate images via the Coze CLI subprocess.

    Calls ``coze generate image "prompt" --format json`` and parses the
    JSON output to extract the image URL.  The PAT is injected through the
    ``COZE_API_KEY`` environment variable so that no prior ``coze auth login``
    is required.
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

    async def generate_image(self, prompt: str, **kwargs) -> str:
        """Run the Coze CLI to generate an image.

        Raises:
            RuntimeError: If the CLI exits with a non-zero status or the
                output cannot be parsed.
        """
        env = {
            "COZE_API_KEY": self._api_key,
            "COZE_BASE_URL": self._base_url,
        }
        if self._billing_project_id:
            env["COZE_BILLING_PROJECT_ID"] = self._billing_project_id
        if self._space_id:
            env["COZE_SPACE_ID"] = self._space_id

        extra_args: list[str] = []
        if self._space_id:
            extra_args.extend(["--space-id", self._space_id])

        cli_cmd = _get_coze_cli()

        # On Windows, .cmd files need cmd.exe to run, but we use
        # create_subprocess_exec to avoid shell injection.
        use_shell = sys.platform == "win32" and cli_cmd.endswith(".cmd")

        if use_shell:
            comspec = os.environ.get("COMSPEC", "cmd.exe")
            args = [
                comspec, "/c", cli_cmd, "generate", "image", prompt,
                *extra_args,
                "--format", "json",
            ]
            logger.info("Running Coze CLI (comspec): %s (prompt truncated: %.60s…)", " ".join(args), prompt)
            proc = await asyncio.create_subprocess_exec(
                *args,
                env={**os.environ, **env},
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        else:
            args = [
                cli_cmd, "generate", "image", prompt,
                *extra_args,
                "--format", "json",
            ]
            logger.info("Running Coze CLI: %s (prompt truncated: %.60s…)", " ".join(args), prompt)
            proc = await asyncio.create_subprocess_exec(
                *args,
                env=env,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)

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

        # Coze CLI JSON output is an array of objects: [{"url": "...", "size": "..."}]
        if isinstance(data, list) and len(data) > 0:
            image_url = data[0].get("url")
        elif isinstance(data, dict):
            image_url = (
                data.get("image_url")
                or data.get("url")
                or data.get("data", {}).get("image_url")
                or data.get("data", {}).get("url")
            )
        else:
            image_url = None

        if not image_url:
            raise RuntimeError(
                f"Coze CLI output has no image URL field. Data: {json.dumps(data, ensure_ascii=False)}"
            )

        return image_url
