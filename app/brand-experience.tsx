"use client";

import { useEffect, useState } from "react";
import { InsightBrandMark, type AgentLocale, type AgentRole } from "./insight-agent";

const welcomeCopy = {
  en: {
    returning: "Welcome back",
    ready: "Your evidence workspace is ready.",
    continue: "Continue to workspace",
    founder: "Founder",
    contributor: "Contributor",
    investor: "Investor",
  },
  zh: {
    returning: "欢迎回来",
    ready: "你的证据工作台已经准备就绪。",
    continue: "进入工作台",
    founder: "创业者",
    contributor: "贡献者",
    investor: "投资人",
  },
  es: {
    returning: "Qué bueno verte de nuevo",
    ready: "Tu espacio de evidencia está listo.",
    continue: "Continuar al espacio",
    founder: "Fundador",
    contributor: "Colaborador",
    investor: "Inversor",
  },
} satisfies Record<AgentLocale, Record<string, string>>;

export function WelcomeSequence({
  name,
  role,
  locale,
  onContinue,
}: {
  name: string;
  role: AgentRole;
  locale: AgentLocale;
  onContinue: () => void;
}) {
  const text = welcomeCopy[locale];
  const firstName = name.trim().split(/\s+/)[0] || "InsightLab";
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === "Escape") onContinue();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onContinue]);
  const title = locale === "zh"
    ? `${firstName}，${text.returning}。`
    : locale === "es"
      ? `${text.returning}, ${firstName}.`
      : `${text.returning}, ${firstName}.`;
  const workspaceLabel = locale === "zh"
    ? `${text[role]}工作台`
    : locale === "es"
      ? `Espacio de ${text[role].toLowerCase()}`
      : `${text[role]} workspace`;
  return <section className="welcome-sequence" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
    <div className="welcome-grid"/><div className="welcome-glow"/>
    <div className="welcome-content">
      <div className="welcome-brand"><InsightBrandMark/><b>InsightLab</b></div>
      <span><i/> {workspaceLabel}</span>
      <h1 id="welcome-title">{title}</h1>
      <p>{text.ready}</p>
      <button onClick={onContinue}>{text.continue}<i>→</i></button>
      <small>VERIFIED IDENTITY · PRIVATE WORKSPACE</small>
    </div>
  </section>;
}

const tourCopy = {
  en: {
    skip: "Skip",
    next: "Next",
    done: "Open Insight AI",
    never: "Do not show this tutorial again on this device",
    steps: [
      ["MEET INSIGHT AI", "Your manual workspace stays in control. Open the role-aware copilot only when you want help framing, explaining, or organizing evidence."],
      ["WORK SIDE BY SIDE", "The assistant uses a narrow panel. Move it to the left or right at any time while the workspace remains editable."],
      ["BRING CONTEXT WITH YOU", "Founders can apply editable survey drafts. Contributors can drag an idea card into the assistant and keep authorship of every submitted response."],
    ],
  },
  zh: {
    skip: "跳过",
    next: "下一步",
    done: "打开 Insight AI",
    never: "以后在这台设备上不再显示",
    steps: [
      ["认识 INSIGHT AI", "手动工作台始终由你控制。只有在需要定义问题、解释项目或整理证据时，才打开专属身份助手。"],
      ["并排协作", "助手只占用一侧的小区域，并且可以随时切换到左侧或右侧；工作台仍可继续编辑。"],
      ["把上下文带给 AI", "创业者可以应用可编辑的问卷草稿；贡献者可以把创意卡片拖入助手，但每一份最终提交都必须保留真实的个人判断。"],
    ],
  },
  es: {
    skip: "Omitir",
    next: "Siguiente",
    done: "Abrir Insight AI",
    never: "No volver a mostrar este tutorial en este dispositivo",
    steps: [
      ["CONOCE INSIGHT AI", "Tu espacio manual mantiene el control. Abre el copiloto solo cuando quieras ayuda para estructurar, explicar u organizar evidencia."],
      ["TRABAJA EN PARALELO", "El asistente ocupa un panel estrecho. Puedes moverlo a la izquierda o derecha sin dejar de editar el espacio."],
      ["LLEVA EL CONTEXTO", "Los fundadores pueden aplicar encuestas editables. Los colaboradores pueden arrastrar una idea y conservar la autoría de cada respuesta."],
    ],
  },
} satisfies Record<AgentLocale, {
  skip: string;
  next: string;
  done: string;
  never: string;
  steps: Array<[string, string]>;
}>;

export function WorkplaceTutorial({
  locale,
  role,
  onClose,
  onLaunch,
}: {
  locale: AgentLocale;
  role: AgentRole;
  onClose: (neverShow: boolean) => void;
  onLaunch: () => void;
}) {
  const [step, setStep] = useState(0);
  const [neverShow, setNeverShow] = useState(false);
  const text = tourCopy[locale];
  const final = step === text.steps.length - 1;
  const finish = () => {
    onClose(neverShow);
    onLaunch();
  };
  return <div className="workplace-tour-backdrop" role="dialog" aria-modal="true" aria-labelledby="tour-title">
    <section className={`workplace-tour step-${step + 1}`}>
      <header><span>0{step + 1} / 0{text.steps.length}</span><button onClick={() => onClose(false)}>{text.skip} ×</button></header>
      <div className="tour-visual" aria-hidden="true">
        {step === 0 && <div className="tour-ai-orbit"><i/><i/><i/><InsightBrandMark/><span>AI</span></div>}
        {step === 1 && <div className="tour-split"><i/><b/><span><InsightBrandMark/> AI</span></div>}
        {step === 2 && <div className="tour-drag"><article><span>{role === "founder" ? "SURVEY" : "IDEA"}</span><i/><i/><i/></article><b>→</b><div><InsightBrandMark/><span>AI</span></div></div>}
      </div>
      <div className="tour-copy">
        <span>INSIGHTLAB PRODUCT GUIDE</span>
        <h2 id="tour-title">{text.steps[step][0]}</h2>
        <p>{text.steps[step][1]}</p>
      </div>
      {final && <label className="tour-never"><input type="checkbox" checked={neverShow} onChange={event => setNeverShow(event.target.checked)}/><span>{text.never}</span></label>}
      <footer>
        <div>{text.steps.map((_, index) => <i className={index === step ? "active" : ""} key={index}/>)}</div>
        <button onClick={() => final ? finish() : setStep(current => current + 1)}>{final ? text.done : text.next}<span>→</span></button>
      </footer>
    </section>
  </div>;
}

const ecosystemNames = [
  {key: "yc", name: "Y Combinator", mark: "Y"},
  {key: "skydeck", name: "Berkeley SkyDeck", mark: "SKYDECK"},
  {key: "bair", name: "Berkeley BAIR", mark: "BAIR"},
  {key: "sese", name: "SESE", mark: "SESE"},
  {key: "miracle", name: "奇绩创坛 · MiraclePlus", mark: "奇绩创坛"},
];

export function EcosystemMarquee({locale}: {locale: AgentLocale}) {
  const title = locale === "zh" ? "我们连接并关注的创业生态" : locale === "es" ? "ECOSISTEMAS QUE CONECTAMOS Y SEGUIMOS" : "STARTUP ECOSYSTEMS WE CONNECT AND FOLLOW";
  return <section className="ecosystem-marquee" aria-label={title}>
    <div className="ecosystem-marquee-label"><span>{title}</span><i/></div>
    <div className="ecosystem-marquee-window">
      <div className="ecosystem-marquee-track">
        {[...ecosystemNames, ...ecosystemNames].map((item, index) => <article className={`ecosystem-logo ${item.key}`} key={`${item.key}-${index}`} aria-label={item.name}>
          <div>{item.key === "yc" && <span>Y</span>}{item.key === "skydeck" && <><i/><b>SKYDECK</b></>}{item.key === "bair" && <><i>◈</i><b>BAIR</b></>}{item.key === "sese" && <><i/><b>SESE</b></>}{item.key === "miracle" && <><i/><i/><i/><b>奇绩创坛</b></>}</div>
          <small>{item.name}</small>
        </article>)}
      </div>
    </div>
  </section>;
}
