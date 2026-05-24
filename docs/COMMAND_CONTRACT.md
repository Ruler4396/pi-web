# Pi Web Command Contract

This document defines the current user-facing slash command contract between `pi-web` and `pi_rust`.

## Execution Boundary

- `pi-web` owns browser UI state, command completion hints, SSE forwarding, and lightweight command routing.
- `pi_rust` owns model execution, tool execution, autonomous loops, persistence, and cancellation.
- Commands that are not explicitly handled by `pi-web` must be forwarded as normal prompts or mapped to a concrete `pi_rust` RPC command.

## Commands

| Command | Frontend behavior | RPC behavior | Completion rule |
| --- | --- | --- | --- |
| `/help` | Opens the shortcuts panel. | None. | Immediate UI action. |
| `/keys`, `/settings` | Opens settings/API key UI. | Config API only. | Immediate UI action. |
| `/config` | Opens runtime config UI. | Config API only. | Immediate UI action. |
| `/models` | Opens model selector. | `set_model` only after selection. | Immediate UI action. |
| `/theme dark`, `/theme light` | Updates local theme. | None. | Immediate UI action. |
| `/clear` | Clears browser-visible message state. | None. | Immediate UI action. |
| `/goal <text>` | Sent to the active session and shown as a Goal status pill. | `goal` with bounded `maxIterations`. | Ends on `goal_end`, `agent_end`, abort, max iterations, turn budget, or repeated no-progress guard. |
| `/plan ...` | Forwarded to the model as prompt text. | `prompt`. | Ends on `agent_end`. |
| `/init ...` | Forwarded to the model as prompt text. | `prompt`. | Ends on `agent_end`. |
| `/compact ...` | Forwarded to the model/runtime as prompt text unless the runtime adds a dedicated RPC command. | `prompt` today. | Ends on `agent_end`. |
| `/fork ...` | Forwarded to the model/runtime as prompt text unless the runtime adds a dedicated RPC command. | `prompt` today. | Ends on `agent_end`. |
| `/btw ...` | Forwarded as a prompt with frontend-only temporary-message intent today. | `prompt`. | Ends on `agent_end`. |

## File Mentions

Typing `@` in the composer opens a current-workspace file picker rooted at the active session `cwd`.
Selecting a file inserts `@relative/path` into the visible message. Before `pi-web` sends the
message to `pi_rust`, it expands up to five referenced files into explicit `<file path="...">`
blocks with a 20,000 character cap per file. The user-visible message remains compact, while the
runtime receives enough context to act without guessing which file was intended.

## Goal Loop Invariants

`/goal` must satisfy these invariants before it is considered production-ready:

- It emits `goal_start`, one or more `goal_iteration` events, and exactly one `goal_end`.
- It cannot run with an unbounded iteration count.
- It cannot run with an unbounded number of model/tool turns inside one iteration.
- It stops after repeated normalized no-progress assistant responses.
- It remains abortable through the existing `abort` RPC command.
- The frontend must surface running, completed, and stopped states instead of treating `/goal` as a normal opaque chat response.

## Completion Notification

When `pi-web` observes `agent_end`, it sends a best-effort completion notification through the
Hermes MCP bridge by calling the `send_wecom_notification` tool. The default command is
`python3 /root/dev/hermes-bridge/mcp_server.py`; override it with `PI_WEB_HERMES_NOTIFY_COMMAND`
and `PI_WEB_HERMES_NOTIFY_ARGS`, or disable it with `PI_WEB_HERMES_NOTIFY=0`.
Notification failure is logged but must not block or fail the chat stream.

## CI Boundary

Do not build on the remote server. Push source changes and let GitHub Actions produce deployable artifacts.
