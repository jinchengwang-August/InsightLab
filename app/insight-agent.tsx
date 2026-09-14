"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type AgentRole = "founder" | "contributor" | "investor";
export type AgentLocale = "en" | "zh" | "es";
export type AgentSide = "left" | "right";

export type AgentIdeaContext = {
  id: number;
  title: string;
  question: string;
  category: string;
  founder: string;
  score: number;
  responses: number;
  reward: number;
};

export type FounderAgentPatch = {
  title: string;
  decision: string;
  audience: string;
  studyType: "idea" | "survey";
  requestedData: string[];
  questions: Array<{
    id: string;
    prompt: string;
    type: "scale" | "single" | "multiple" | "text";
    required: boolean;
    options: string[];
  }>;
};

export type ContributorAgentPatch = {
  category: string;
  search: string;
  commentDraft: string;
};

export type InsightAgentPatch = {
  founder: FounderAgentPatch | null;
  contributor: ContributorAgentPatch | null;
};

export type InsightAgentContext = {
  founder?: {
    title: string;
    decision: string;
    audience: string;
    studyType: "idea" | "survey";
    requestedData: string[];
    questions: Array<{prompt: string; type: string; required: boolean; options: string[]}>;
  };
  contributor?: {
    category: string;
    search: string;
    activeIdea: AgentIdeaContext | null;
    commentDraft: string;
  };
  investor?: {
    focus: string;
  };
};

type AgentReply = {
  message: string;
  summary: string;
  confidence: "verified" | "inferred" | "needs-data";
  suggestedPrompts: string[];
  workspacePatch: InsightAgentPatch | null;
  draftId?: string | null;
  serviceMode?: "live" | "guided";
  serviceNotice?: string;
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  reply?: AgentReply;
};

type ApiFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const copy = {
  en: {
    label: "INSIGHT AI",
    title: "Your role-aware copilot",
    online: "SERVER-SIDE · PRIVATE CONTEXT",
    close: "Close Insight AI",
    moveLeft: "Move assistant to the left",
    moveRight: "Move assistant to the right",
    emptyFounder: "Describe the problem, who feels it, and what decision you need to make. I can turn that into an editable validation study.",
    emptyContributor: "Tell me what you care about, or drag an idea card here. I can explain it, narrow the feed, and help structure your own notes.",
    emptyInvestor: "Ask for a comparison, evidence gap, or a clearer reading of the signal. Unverified claims stay visibly unverified.",
    placeholderFounder: "Describe your idea or ask for a survey…",
    placeholderContributor: "What kind of idea interests you?",
    placeholderInvestor: "Compare a signal or inspect evidence…",
    send: "Send",
    thinking: "Reading your workspace…",
    apply: "Apply to workspace",
    applied: "Applied",
    drop: "Drop an idea card here",
    sourceVerified: "Verified workspace data",
    sourceInferred: "Model inference",
    sourceMissing: "More data needed",
    error: "Insight AI is temporarily unavailable. Your manual workspace is still fully usable.",
    live: "Live model",
    guided: "Guided mode · live model paused",
    privacy: "AI suggestions never publish or submit on your behalf.",
  },
  zh: {
    label: "INSIGHT AI",
    title: "理解你身份的智能协作助手",
    online: "仅服务器调用 · 私密上下文",
    close: "关闭 Insight AI",
    moveLeft: "把助手移到左侧",
    moveRight: "把助手移到右侧",
    emptyFounder: "告诉我问题、目标用户和你要做的决策。我可以把它整理成可编辑的验证方案与问卷。",
    emptyContributor: "告诉我你关注的领域，或把创意卡片拖到这里。我可以解释项目、筛选列表，并帮你整理自己的观点。",
    emptyInvestor: "让我比较项目、指出证据缺口，或解释信号。没有验证的信息会明确标注为未验证。",
    placeholderFounder: "描述你的创意，或让我生成问卷…",
    placeholderContributor: "你对什么类型的创意感兴趣？",
    placeholderInvestor: "比较信号，或检查证据…",
    send: "发送",
    thinking: "正在读取你的工作台…",
    apply: "应用到工作台",
    applied: "已应用",
    drop: "把创意卡片拖到这里",
    sourceVerified: "已验证的工作台数据",
    sourceInferred: "模型推断",
    sourceMissing: "需要更多数据",
    error: "Insight AI 暂时不可用。你仍可正常使用全部手动功能。",
    live: "实时模型",
    guided: "引导模式 · 实时模型暂停",
    privacy: "AI 建议不会替你发布或提交任何内容。",
  },
  es: {
    label: "INSIGHT AI",
    title: "Tu copiloto según tu rol",
    online: "SERVIDOR · CONTEXTO PRIVADO",
    close: "Cerrar Insight AI",
    moveLeft: "Mover el asistente a la izquierda",
    moveRight: "Mover el asistente a la derecha",
    emptyFounder: "Describe el problema, quién lo vive y qué decisión necesitas tomar. Puedo convertirlo en un estudio editable.",
    emptyContributor: "Dime qué te interesa o arrastra una idea aquí. Puedo explicarla, filtrar el listado y ayudarte a estructurar tus propias notas.",
    emptyInvestor: "Pide una comparación, una brecha de evidencia o una lectura más clara de la señal. Los datos no verificados se marcan.",
    placeholderFounder: "Describe tu idea o pide una encuesta…",
    placeholderContributor: "¿Qué tipo de idea te interesa?",
    placeholderInvestor: "Compara una señal o revisa evidencia…",
    send: "Enviar",
    thinking: "Leyendo tu espacio…",
    apply: "Aplicar al espacio",
    applied: "Aplicado",
    drop: "Suelta una tarjeta de idea aquí",
    sourceVerified: "Datos verificados del espacio",
    sourceInferred: "Inferencia del modelo",
    sourceMissing: "Se necesitan más datos",
    error: "Insight AI no está disponible temporalmente. El espacio manual sigue funcionando.",
    live: "Modelo en vivo",
    guided: "Modo guiado · modelo pausado",
    privacy: "Las sugerencias de IA nunca se publican ni se envían por ti.",
  },
} satisfies Record<AgentLocale, Record<string, string>>;

function defaultAssistantMessage(role: AgentRole, locale: AgentLocale) {
  const text = copy[locale];
  return role === "founder" ? text.emptyFounder : role === "contributor" ? text.emptyContributor : text.emptyInvestor;
}

export function InsightBrandMark({className = ""}: {className?: string}) {
  return <span className={`insight-brand-mark ${className}`} aria-hidden="true"/>;
}

export function InsightAgentLauncher({
  locale,
  open,
  onClick,
}: {
  locale: AgentLocale;
  open: boolean;
  onClick: () => void;
}) {
  return <button className={`insight-agent-launcher${open ? " active" : ""}`} onClick={onClick} aria-expanded={open} aria-label={open ? copy[locale].close : copy[locale].title}>
    <InsightBrandMark/>
    <span><b>AI</b><small>{copy[locale].label}</small></span>
    <i>{open ? "×" : "✦"}</i>
  </button>;
}

export function InsightAgentDock({
  role,
  locale,
  side,
  context,
  apiFetch,
  incomingIdea,
  onSideChange,
  onClose,
  onApply,
}: {
  role: AgentRole;
  locale: AgentLocale;
  side: AgentSide;
  context: InsightAgentContext;
  apiFetch: ApiFetch;
  incomingIdea: AgentIdeaContext | null;
  onSideChange: (side: AgentSide) => void;
  onClose: () => void;
  onApply: (patch: InsightAgentPatch, draftId?: string | null) => void;
}) {
  const text = copy[locale];
  const [messages, setMessages] = useState<ChatMessage[]>([
    {id: "welcome", role: "assistant", text: defaultAssistantMessage(role, locale)},
  ]);
  const [composer, setComposer] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [applied, setApplied] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const ideaSignature = incomingIdea ? `${incomingIdea.id}:${incomingIdea.responses}` : "";

  useEffect(() => {
    endRef.current?.scrollIntoView({behavior: "smooth", block: "nearest"});
  }, [messages, busy]);

  const send = useCallback(async (override?: string) => {
    const value = String(override ?? composer).trim();
    if (!value || busy) return;
    const userMessage: ChatMessage = {id: crypto.randomUUID(), role: "user", text: value};
    setMessages(current => [...current, userMessage]);
    setComposer("");
    setBusy(true);
    try {
      const response = await apiFetch("/api/agent", {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({message: value, role, locale, context}),
      });
      const payload = await response.json() as AgentReply & {error?: string};
      if (!response.ok) throw new Error(payload.error ?? "Agent unavailable");
      setMessages(current => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        text: payload.message,
        reply: payload,
      }]);
    } catch (reason) {
      const message = reason instanceof Error && reason.message && reason.message !== "Agent unavailable"
        ? reason.message
        : text.error;
      setMessages(current => [...current, {id: crypto.randomUUID(), role: "assistant", text: message}]);
    } finally {
      setBusy(false);
    }
  }, [apiFetch, busy, composer, context, locale, role, text.error]);

  const quickPrompts = useMemo(() => {
    if (role === "founder") return locale === "zh"
      ? ["把我的想法变成验证问卷", "帮我定义目标用户", "下一步最小实验是什么？"]
      : locale === "es"
        ? ["Convierte mi idea en encuesta", "Define mi público objetivo", "¿Cuál es el siguiente experimento?"]
        : ["Turn my idea into a survey", "Define my target contributors", "What is the smallest next experiment?"];
    if (role === "contributor") return locale === "zh"
      ? ["筛选我感兴趣的创意", "解释当前这家公司", "帮我整理但不要代写观点"]
      : locale === "es"
        ? ["Filtra ideas para mí", "Explica esta empresa", "Estructura mis notas sin escribir por mí"]
        : ["Filter ideas for my interests", "Explain this company", "Structure my notes without writing for me"];
    return locale === "zh"
      ? ["比较项目证据质量", "指出未验证的假设", "解释当前阶段与风险"]
      : locale === "es"
        ? ["Compara la evidencia", "Señala supuestos", "Explica etapa y riesgo"]
        : ["Compare evidence quality", "Flag unverified assumptions", "Explain stage and risk"];
  }, [locale, role]);

  return <aside className={`insight-agent-dock ${side}`} aria-label={text.title}>
    <header>
      <div className="agent-identity"><InsightBrandMark/><span><b>{text.label}</b><small><i/>{text.online}</small></span></div>
      <div className="agent-window-actions">
        <button onClick={() => onSideChange(side === "right" ? "left" : "right")} aria-label={side === "right" ? text.moveLeft : text.moveRight}>{side === "right" ? "⇤" : "⇥"}</button>
        <button onClick={onClose} aria-label={text.close}>×</button>
      </div>
    </header>
    <div className={`agent-drop-zone${dragging ? " active" : ""}`}
      onDragEnter={event => {event.preventDefault(); setDragging(true);}}
      onDragOver={event => event.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={event => {
        event.preventDefault();
        setDragging(false);
        const raw = event.dataTransfer.getData("application/x-insightlab-idea");
        if (!raw) return;
        try {
          const idea = JSON.parse(raw) as AgentIdeaContext;
          const prompt = locale === "zh"
            ? `请解释 ${idea.title} 的核心问题、现有信号和仍需验证的风险。`
            : locale === "es"
              ? `Explica el problema central, las señales actuales y los riesgos por validar de ${idea.title}.`
              : `Explain ${idea.title}'s core problem, current signals, and risks that still need validation.`;
          setComposer(prompt);
        } catch {
          setComposer("");
        }
      }}>
      <span>⇣</span>{text.drop}
    </div>
    {incomingIdea&&<button className="agent-context-card" key={ideaSignature} onClick={() => void send(locale === "zh"
      ? `请解释 ${incomingIdea.title} 在解决什么问题、已有信号说明了什么，以及哪些信息仍然缺失。`
      : locale === "es"
        ? `Explica qué problema resuelve ${incomingIdea.title}, qué indican sus señales y qué datos faltan.`
        : `Explain the problem ${incomingIdea.title} addresses, what its current signals mean, and which facts are still missing.`)}>
      <span>{incomingIdea.category}</span><b>{incomingIdea.title}</b><small>{incomingIdea.responses} responses · {incomingIdea.score} signal</small><i>Analyze →</i>
    </button>}
    <div className="agent-messages" aria-live="polite">
      {messages.map(message => <article className={message.role} key={message.id}>
        <div className="agent-message-author">{message.role === "assistant" ? <><InsightBrandMark/><b>Insight AI</b></> : <b>{locale === "zh" ? "你" : locale === "es" ? "Tú" : "You"}</b>}</div>
        <p>{message.text}</p>
        {message.reply && <div className="agent-reply-meta">
          <span className={`agent-service-mode ${message.reply.serviceMode === "guided" ? "guided" : "live"}`}>
            {message.reply.serviceMode === "guided" ? text.guided : text.live}
          </span>
          {message.reply.serviceNotice && <small className="agent-service-notice">{message.reply.serviceNotice}</small>}
          <span className={message.reply.confidence}>{message.reply.confidence === "verified" ? text.sourceVerified : message.reply.confidence === "inferred" ? text.sourceInferred : text.sourceMissing}</span>
          {message.reply.summary && <small>{message.reply.summary}</small>}
          {message.reply.workspacePatch && (message.reply.workspacePatch.founder || message.reply.workspacePatch.contributor) && <button disabled={applied.includes(message.id)} onClick={() => {
            if (!message.reply?.workspacePatch) return;
            onApply(message.reply.workspacePatch, message.reply.draftId);
            setApplied(current => [...current, message.id]);
          }}>{applied.includes(message.id) ? `✓ ${text.applied}` : `↙ ${text.apply}`}</button>}
        </div>}
      </article>)}
      {busy && <article className="assistant agent-thinking"><div className="agent-message-author"><InsightBrandMark/><b>Insight AI</b></div><p><i/><i/><i/> {text.thinking}</p></article>}
      <div ref={endRef}/>
    </div>
    <div className="agent-quick-prompts">{quickPrompts.map(prompt => <button key={prompt} onClick={() => void send(prompt)}>{prompt}</button>)}</div>
    <form className="agent-composer" onSubmit={event => {event.preventDefault(); void send();}}>
      <textarea value={composer} onChange={event => setComposer(event.target.value)} placeholder={role === "founder" ? text.placeholderFounder : role === "contributor" ? text.placeholderContributor : text.placeholderInvestor} maxLength={1800} onKeyDown={event => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          void send();
        }
      }}/>
      <button disabled={busy || !composer.trim()} aria-label={text.send}>↑</button>
    </form>
    <footer>{text.privacy}</footer>
  </aside>;
}
