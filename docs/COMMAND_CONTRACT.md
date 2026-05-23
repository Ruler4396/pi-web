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

## Goal Loop Invariants

`/goal` must satisfy these invariants before it is considered production-ready:

- It emits `goal_start`, one or more `goal_iteration` events, and exactly one `goal_end`.
- It cannot run with an unbounded iteration count.
- It cannot run with an unbounded number of model/tool turns inside one iteration.
- It stops after repeated normalized no-progress assistant responses.
- It remains abortable through the existing `abort` RPC command.
- The frontend must surface running, completed, and stopped states instead of treating `/goal` as a normal opaque chat response.

## CI Boundary

Do not build on the remote server. Push source changes and let GitHub Actions produce deployable artifacts.
