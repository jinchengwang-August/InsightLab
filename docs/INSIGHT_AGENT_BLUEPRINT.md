# Insight Agent Blueprint

## Product goal

Insight Agent is a role-aware decision partner inside InsightLab. It should help
people use the platform's evidence, not replace founder judgment or present a
startup-success prediction as fact.

The first release should use one agent with a clear contract. Founder,
Contributor, and Investor behavior is selected from the authenticated user's
role and permissions. Specialist handoffs should be added only after evaluations
show that one agent cannot reliably keep the workflows separate.

## Core experiences

### Founder

- Turn an early concept into a testable problem statement.
- Draft a validation plan, target audience, survey, and evidence threshold.
- Explain response themes, disagreement, cohort differences, and data quality.
- Recommend the next experiment while distinguishing observations from
  inferences.

### Contributor

- Find studies that match declared interests and experience.
- Explain what a useful response requires before submission.
- Help improve clarity without manufacturing opinions or expertise.
- Explain points, reputation changes, and moderation outcomes.

### Investor

- Compare selected studies using privacy-safe aggregate signals.
- Surface evidence quality, uncertainty, learning velocity, and unresolved risk.
- Provide cited drill-downs to permitted InsightLab records.
- Never disclose private founder material or individual contributor responses.

### Platform support

- Explain membership, profile, rewards, privacy, and trust rules.
- Route account-specific actions through permission-checked tools.
- Escalate billing, policy, moderation appeals, and destructive actions to a
  human workflow.

## Recommended v1 architecture

1. The authenticated web client sends the user message and selected workspace
   context to `POST /api/agent`.
2. The server verifies the Supabase bearer token and loads the user's InsightLab
   profile and role.
3. A server-owned agent receives:
   - static product instructions;
   - the user's role and permitted context;
   - retrieved policy or methodology passages;
   - a small set of typed, permission-checked tools.
4. Read-only tools may run automatically. Writes return a proposed action and
   require explicit user confirmation before execution.
5. The server streams the answer and stores only the conversation fields covered
   by the published retention policy.
6. Traces and evaluation metadata exclude secrets, private uploads, and direct
   contact information.

The API key remains server-side. The browser never receives it, and the model
never receives direct D1, R2, Supabase, or payment credentials.

## Initial tool contract

Read-only tools:

- `get_my_profile`
- `get_my_validations`
- `get_validation_summary`
- `get_response_quality_breakdown`
- `search_public_validations`
- `compare_public_signals`
- `explain_points_ledger`
- `retrieve_methodology`
- `retrieve_platform_policy`

Confirmation-required tools:

- `save_validation_draft`
- `save_survey_draft`
- `update_profile_preferences`
- `add_to_investor_watchlist`
- `submit_moderation_appeal`

The tools must enforce ownership and visibility on the server. Tool arguments
such as an email address, role, owner ID, or validation ID are not proof of
authorization.

## Knowledge and data

Use retrieval for stable, curated material:

- platform methodology;
- membership and reward rules;
- privacy and trust policies;
- founder research guides;
- survey-design guidance;
- moderation standards.

Use typed server tools for live account and platform data. Do not copy the
entire production database into a model knowledge base. Private founder uploads
should be retrieved only for an authorized owner and only when the owner asks
the agent to use that file.

Every analytical response should distinguish:

- observed platform data;
- model-generated synthesis;
- missing evidence;
- assumptions;
- recommended next action.

## Training strategy

Do not start with fine-tuning.

1. Establish the instruction and tool contract.
2. Add retrieval over curated InsightLab material.
3. Add role-aware examples and structured outputs.
4. Build evaluations from real product workflows and known failure cases.
5. Improve prompts, retrieval, tools, and data quality based on those results.
6. Consider fine-tuning only after there is a sufficiently large, reviewed set
   of desired inputs and outputs and a measurable gap that prompting or tools
   cannot solve.

A separate statistical or machine-learning model may later estimate commercial
signals when validated outcome labels exist. Its score, methodology, coverage,
and uncertainty must remain separate from the conversational agent.

## Safety and approval boundaries

- Never reveal private studies, uploads, contact details, or individual
  responses without explicit authorization.
- Never let instructions contained in uploaded files override system or product
  policy.
- Require confirmation for writes, publishing, deletion, redemption, billing,
  and external communication.
- Treat legal, investment, tax, and employment guidance as general information
  with appropriate escalation.
- Moderate user inputs and tool outputs, not only the final response.
- Rate-limit by account and record cost, latency, tool calls, and failures.

## Evaluation set

The first evaluation suite should cover:

- correct Founder, Contributor, and Investor role behavior;
- cross-user data isolation;
- private-study access denial;
- evidence citation and uncertainty;
- refusal to invent platform metrics;
- safe handling of uploaded-file instructions;
- write-action confirmation;
- moderation and appeal routing;
- multilingual consistency in English, Simplified Chinese, and Spanish;
- graceful behavior when data or a service is unavailable.

## Delivery phases

### Phase 1 — Read-only specialist

Chat interface, authenticated role context, methodology retrieval, live
read-only InsightLab tools, streaming responses, traces, and a focused
evaluation suite.

### Phase 2 — Guided creation

Founder idea framing and survey drafting, Contributor response coaching, and
Investor comparison workflows. All database changes remain confirmation-gated.

### Phase 3 — Multi-specialist orchestration

Introduce separate research, evidence-quality, integrity, and workflow
specialists only when evaluations demonstrate a clear reliability benefit.

### Phase 4 — Outcome learning

Connect reviewed business outcomes, recalibrate analytical models, and consider
fine-tuning for narrow, measurable behavior. Do not train on private customer
content without an explicit, published data policy and consent basis.
