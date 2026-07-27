"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { geoDistance, geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import worldData from "world-atlas/countries-110m.json";
import { createClient, type SupabaseClient, type User as SupabaseUser } from "@supabase/supabase-js";
import { hasVerifiedSupabaseSession } from "./auth-flow";
import { discoveryModeForResponse, type DiscoveryMode } from "./discovery-flow";

type Role = "founder" | "contributor" | "investor";
type Locale = "en" | "zh" | "es";
type AuthProviders = { email:boolean; phone:boolean; google:boolean; github:boolean };
type AuthIntent = "login" | "register";
type View = "home" | "platform-insights" | "founder" | "contributor" | "contributor-insights" | "investor" | "investor-insights" | "analytics" | "rewards" | "meet" | "profile" | "trust" | "help";
type AuthUser = { id:string; displayName:string; email:string|null; phone:string|null };
type UserProfile = {
  displayName:string;
  role:Role;
  memberTier:string;
  reputationScore:number;
  pointsBalance:number;
  coverStyle:string;
  interests:string[];
  headline:string;
  bio:string;
  location:string;
  website:string;
  avatarUrl:string;
  email:string;
  phone:string|null;
  preferredLanguage:Locale;
};
type ApiFetch = (input:RequestInfo|URL, init?:RequestInit)=>Promise<Response>;
type ContributionType = "rating" | "comment" | "survey";
type SurveyQuestion = {id:string;prompt:string;type:"scale"|"single"|"multiple"|"text";required:boolean;options:string[]};
type Idea = {
  id:number;category:string;title:string;question:string;founder:string;score:number;responses:number;
  reward:number;trend:string;color:string;quality:number;risk:number;velocity:number;resonance:number;
  availableModes:ContributionType[];surveyQuestions:SurveyQuestion[];
};
type ValidationRecord = {
  id:number;title:string;description:string;category:string;status:string;study_type?:string;
  reward_points?:number;signal_score?:number|null;response_count?:number;survey_json?:string;
};

const categoryColors:Record<string,string>={
  Climate:"#d7663e","Digital Health":"#bf7951","Future of Work":"#a97956",
  Education:"#8a8a5c","Consumer AI":"#7a5f78",Other:"#657d6a",
};

function parseSurveyQuestions(value:unknown):SurveyQuestion[]{
  if(typeof value!=="string"||!value.trim())return [];
  try{
    const parsed=JSON.parse(value) as unknown;
    if(!Array.isArray(parsed))return [];
    return parsed.filter((item):item is SurveyQuestion=>Boolean(
      item&&typeof item==="object"&&"id" in item&&"prompt" in item&&"type" in item&&"options" in item
    ));
  }catch{return [];}
}

function validationToIdea(row:ValidationRecord,founderLabel="InsightLab founder"):Idea{
  const responses=Math.max(0,Number(row.response_count??0));
  const score=Math.max(0,Math.min(100,Math.round(Number(row.signal_score??(responses?55+Math.sqrt(responses)*4:0)))));
  const surveyQuestions=parseSurveyQuestions(row.survey_json);
  return {
    id:Number(row.id),category:String(row.category||"Other"),title:String(row.title),
    question:String(row.description),founder:founderLabel,score,responses,
    reward:Math.max(0,Number(row.reward_points??0)),trend:responses?"Live":"New",
    color:categoryColors[String(row.category)]??categoryColors.Other,quality:score,
    risk:Math.max(0,100-score),velocity:Math.min(100,45+responses*2),resonance:score,
    availableModes:row.study_type==="survey"&&surveyQuestions.length?["rating","comment","survey"]:["rating","comment"],
    surveyQuestions,
  };
}

const ideas:Idea[] = [
  { id:1,category:"Climate",title:"Loop",question:"Would doorstep pickup make reusable takeout packaging effortless?",founder:"Maya Chen",score:87,responses:284,reward:120,trend:"+18%",color:"#d7663e",quality:91,risk:34,velocity:82,resonance:89,availableModes:["rating","comment","survey"],surveyQuestions:[
    {id:"loop-1",prompt:"How often do you order takeout in a typical week?",type:"single",required:true,options:["0–1 times","2–3 times","4+ times"]},
    {id:"loop-2",prompt:"What would stop you from returning reusable packaging?",type:"text",required:true,options:[]},
  ]},
  { id:2,category:"Future of Work",title:"Proofwork",question:"Could thoughtful contributions become a better hiring signal than a résumé?",founder:"Noah Williams",score:81,responses:156,reward:80,trend:"+24%",color:"#a97956",quality:88,risk:48,velocity:86,resonance:84,availableModes:["rating","comment","survey"],surveyQuestions:[
    {id:"proof-1",prompt:"How useful would verified project contributions be during hiring?",type:"scale",required:true,options:[]},
    {id:"proof-2",prompt:"Which proof matters most?",type:"single",required:true,options:["Quality of work","Team collaboration","Difficulty","Consistency"]},
  ]},
  { id:3,category:"Digital Health",title:"PulseNest",question:"Which everyday signal would make recovery feel less uncertain?",founder:"Aria Patel",score:92,responses:412,reward:160,trend:"+31%",color:"#bf7951",quality:94,risk:39,velocity:93,resonance:95,availableModes:["rating","comment","survey"],surveyQuestions:[
    {id:"pulse-1",prompt:"Which recovery signal would you trust most?",type:"single",required:true,options:["Sleep trend","Resting heart rate","Energy check-in","Combined baseline"]},
    {id:"pulse-2",prompt:"What context should always accompany a recovery score?",type:"text",required:true,options:[]},
  ]},
  { id:4,category:"Education",title:"StudioPeer",question:"Would weekly peer critique make self-guided learning easier to sustain?",founder:"Eli Park",score:76,responses:98,reward:90,trend:"+9%",color:"#8a8a5c",quality:79,risk:55,velocity:68,resonance:78,availableModes:["rating","comment"],surveyQuestions:[] },
];

const roleContent = {
  founder: {
    label: "Founder",
    eyebrow: "VALIDATE BEFORE YOU BUILD",
    typed: ["an idea worth building.", "a problem people feel.", "evidence you can defend."],
    description: "Describe what you believe, specify whose feedback matters, and watch raw opinions become structured market evidence.",
  },
  contributor: {
    label: "Contributor",
    eyebrow: "MAKE YOUR PERSPECTIVE COUNT",
    typed: ["products you want to use.", "teams you want to join.", "markets before they move."],
    description: "Follow the fields you care about, rate emerging ideas, and build a reputation from the quality of your thinking.",
  },
  investor: {
    label: "Investor",
    eyebrow: "SEE SIGNAL BEFORE THE PITCH",
    typed: ["demand before traction.", "patterns before consensus.", "founders who learn fast."],
    description: "Compare problem resonance, response quality, and learning velocity across early-stage categories.",
  },
};

const landingContent = {
  eyebrow: "IDEA VALIDATION, BUILT FOR EVERY PERSPECTIVE",
  typed: ["an idea worth building.", "the signal behind the noise.", "evidence before execution."],
  description: "InsightLab connects founders, contributors, and investors in one structured validation network—so early ideas can learn before they become expensive.",
};

const languageOptions:Array<{value:Locale;label:string;longLabel:string}> = [
  {value:"en",label:"EN",longLabel:"English"},
  {value:"zh",label:"中文",longLabel:"中文"},
  {value:"es",label:"ES",longLabel:"Español"},
];

const uiCopy = {
  en: {
    nav:{home:"Home",workspace:"Workspace",insights:"Insights",meet:"Meet us",profile:"Profile",general:"General"},
    landing:{eyebrow:landingContent.eyebrow,typed:landingContent.typed,prefix:"Find",description:landingContent.description,start:"Start using InsightLab",meet:"Meet the people behind it",signIn:"Sign in",openWorkspace:"Open workspace",publicNetwork:"PUBLIC VALIDATION NETWORK",connecting:"CONNECTING LIVE PRESENCE",online:"ONLINE NOW",roles:"3 ROLE-SPECIFIC WORKSPACES",review:"HUMAN + MODEL REVIEW"},
    footer:{tagline:"Build what people actually want.",insights:"Platform insights",terms:"Membership terms",trust:"Trust center",help:"Help",meet:"Meet us",signOut:"Sign out",signIn:"Sign in",copyright:"© 2026 InsightLab · Human insight, structured responsibly."},
  },
  zh: {
    nav:{home:"首页",workspace:"工作台",insights:"洞察",meet:"认识我们",profile:"个人主页",general:"公共平台"},
    landing:{eyebrow:"为每一种视角打造的创意验证平台",typed:["值得打造的想法。","噪声背后的信号。","执行之前的证据。"],prefix:"发现",description:"InsightLab 把创业者、贡献者与投资人连接到同一个结构化验证网络，让早期想法在投入高昂成本前先获得真实反馈。",start:"开始使用 InsightLab",meet:"认识平台背后的团队",signIn:"登录",openWorkspace:"进入工作台",publicNetwork:"公共创意验证网络",connecting:"正在连接实时在线数据",online:"人在线",roles:"3 个身份专属工作台",review:"人工判断 + 模型分析"},
    footer:{tagline:"真正理解需求，再开始打造。",insights:"平台数据总览",terms:"会员条款",trust:"诚信与安全",help:"帮助中心",meet:"认识我们",signOut:"退出登录",signIn:"登录",copyright:"© 2026 InsightLab · 负责任地组织每一份真实洞察。"},
  },
  es: {
    nav:{home:"Inicio",workspace:"Espacio",insights:"Insights",meet:"Conócenos",profile:"Perfil",general:"Plataforma"},
    landing:{eyebrow:"VALIDACIÓN DE IDEAS DESDE CADA PERSPECTIVA",typed:["una idea que valga la pena.","la señal detrás del ruido.","evidencia antes de ejecutar."],prefix:"Encuentra",description:"InsightLab conecta a fundadores, colaboradores e inversores en una red de validación estructurada para que las ideas aprendan antes de volverse costosas.",start:"Empezar con InsightLab",meet:"Conoce al equipo",signIn:"Iniciar sesión",openWorkspace:"Abrir espacio",publicNetwork:"RED PÚBLICA DE VALIDACIÓN",connecting:"CONECTANDO PRESENCIA EN VIVO",online:"EN LÍNEA",roles:"3 ESPACIOS SEGÚN TU ROL",review:"REVISIÓN HUMANA + MODELO"},
    footer:{tagline:"Construye lo que la gente realmente quiere.",insights:"Resumen de la plataforma",terms:"Condiciones de membresía",trust:"Confianza y seguridad",help:"Ayuda",meet:"Conócenos",signOut:"Cerrar sesión",signIn:"Iniciar sesión",copyright:"© 2026 InsightLab · Perspectiva humana, estructurada con responsabilidad."},
  },
} satisfies Record<Locale, {
  nav:Record<"home"|"workspace"|"insights"|"meet"|"profile"|"general",string>;
  landing:{eyebrow:string;typed:string[];prefix:string;description:string;start:string;meet:string;signIn:string;openWorkspace:string;publicNetwork:string;connecting:string;online:string;roles:string;review:string};
  footer:Record<"tagline"|"insights"|"terms"|"trust"|"help"|"meet"|"signOut"|"signIn"|"copyright",string>;
}>;

const originalInterfaceText=new WeakMap<Text,string>();
const interfaceTranslations:Record<Exclude<Locale,"en">,Record<string,string>>={
  zh:{
    "Platform insights":"平台数据总览","Meet us":"认识我们","Profile":"个人主页","Workspace":"工作台","Insights":"洞察",
    "Design the evidence":"先设计证据","before collecting it.":"再开始收集。","Open full analysis ↗":"打开完整分析 ↗",
    "Idea or working title":"创意或项目名称","What decision should this evidence support?":"这些证据需要支持什么决策？",
    "Who should respond?":"目标反馈人群","Study visibility":"调研可见范围","Choose the results you want":"选择你希望获得的数据",
    "Target responses":"目标回复数","Estimated reward pool":"预计积分池","Create validation draft →":"创建验证草稿 →",
    "Find ideas worth your attention.":"发现值得你关注的创意。","CHOOSE YOUR EFFORT":"选择投入程度","Quick rating":"快速评分",
    "Reasoned comment":"有理由的评论","Full survey":"完整问卷","Search ideas or questions":"搜索创意或问题",
    "Good thinking":"有价值的思考","compounds.":"会持续积累。","Trust Center":"诚信与安全中心","Help Center":"帮助中心",
    "Edit profile":"编辑个人主页","Sign out":"退出登录","Sign in":"登录","Continue with Google":"使用 Google 继续",
    "Create account":"注册账号","Display name":"显示名称","Email address":"邮箱地址","Send registration code →":"发送注册验证码 →",
    "Send sign-in code →":"发送登录验证码 →","Complete registration →":"完成注册 →","Back to InsightLab":"返回 InsightLab",
  },
  es:{
    "Platform insights":"Resumen de plataforma","Meet us":"Conócenos","Profile":"Perfil","Workspace":"Espacio","Insights":"Datos",
    "Design the evidence":"Diseña la evidencia","before collecting it.":"antes de recopilarla.","Open full analysis ↗":"Abrir análisis completo ↗",
    "Idea or working title":"Idea o nombre provisional","What decision should this evidence support?":"¿Qué decisión debe apoyar esta evidencia?",
    "Who should respond?":"Público objetivo","Study visibility":"Visibilidad del estudio","Choose the results you want":"Elige los resultados deseados",
    "Target responses":"Respuestas objetivo","Estimated reward pool":"Puntos estimados","Create validation draft →":"Crear borrador →",
    "CHOOSE YOUR EFFORT":"ELIGE TU ESFUERZO","Quick rating":"Valoración rápida","Reasoned comment":"Comentario razonado",
    "Full survey":"Encuesta completa","Search ideas or questions":"Buscar ideas o preguntas","Edit profile":"Editar perfil",
    "Sign out":"Cerrar sesión","Sign in":"Iniciar sesión","Create account":"Crear cuenta","Display name":"Nombre visible",
    "Email address":"Correo electrónico","Send registration code →":"Enviar código de registro →","Send sign-in code →":"Enviar código de acceso →",
    "Complete registration →":"Completar registro →","Back to InsightLab":"Volver a InsightLab",
  },
};

Object.assign(interfaceTranslations.zh,{
  "ONE NETWORK · THREE PERSPECTIVES":"一个网络 · 三种视角","Turn uncertainty":"把不确定性","into evidence.":"转化为证据。",
  "Secure identity, role-specific workspaces, and feedback that compounds into reputation.":"安全身份、角色专属工作台，以及能够持续积累信誉的反馈。",
  "IDENTITY VERIFIED":"身份已验证","Make InsightLab yours.":"创建你的 InsightLab 身份。",
  "Choose the role that should shape your first workspace. You can expand your profile at any time.":"选择你的主要身份，之后仍可继续完善个人资料。",
  "Short introduction":"个人简介","Publish and validate ideas":"发布并验证创意","Review ideas and build reputation":"评价创意并积累信誉",
  "Track evidence and emerging signal":"追踪证据与新兴信号","SECURE ACCESS":"安全访问","Enter InsightLab.":"登录 InsightLab。",
  "Only registered InsightLab identities can sign in.":"只有已注册的 InsightLab 身份可以登录。","or use a verification code":"或使用验证码",
  "Phone":"手机号码","Verification code":"验证码","Send another code":"重新发送验证码","Preparing secure sign-in…":"正在准备安全登录…",
  "FOUNDER VALIDATION STUDIO":"创业者验证工作室","Frame":"定义","Design":"设计","Preview":"预览","Idea only":"仅创意",
  "Rating + open feedback":"评分和开放反馈","Guided survey":"引导式问卷","Custom questions + analysis":"自定义问题和分析",
  "Public discovery":"公开展示","Targeted audience":"定向人群","Private link":"私密链接","GitHub repository":"GitHub 仓库",
  "PERSONALIZED QUESTIONNAIRE":"个性化问卷","Add question":"添加问题","Required":"必答","Research design check":"调研设计检查",
  "CONTRIBUTOR DISCOVERY":"贡献者发现","All":"全部","Choose response →":"选择反馈方式 →","Verified founder":"已认证创业者",
  "Reset discovery":"重置筛选","No exact matches.":"没有完全匹配的结果。","Try another category or a shorter search phrase.":"请尝试其他类别或更短的关键词。",
  "CONTRIBUTOR · PERSONAL INSIGHTS":"贡献者 · 个人洞察","Your comments created":"你的反馈创造了","measurable value.":"可衡量的价值。",
  "Review every idea you helped sharpen, how the integrity model weighted your reasoning, and the points each contribution earned.":"查看你参与过的创意、诚信模型如何计算权重，以及每次贡献获得的积分。",
  "POINTS OVER TIME":"积分变化","No contributions yet.":"尚无贡献记录。","Explore ideas →":"浏览创意 →",
  "INVESTOR SIGNAL DESK":"投资人信号台","CATEGORY MOMENTUM":"类别趋势","HIGH-SIGNAL PROJECTS":"高信号项目",
  "INVESTOR · INTERACTIVE INSIGHTS":"投资人 · 交互式洞察","Interrogate the signal,":"分析信号，","not just the score.":"而不只是看分数。",
  "DEMO MARKET DATA":"演示市场数据","EVIDENCE INSPECTOR":"证据检查器","Problem resonance":"问题共鸣","Response quality":"反馈质量",
  "Learning velocity":"学习速度","Execution readiness":"执行准备度","PROFILE EDITOR":"个人主页编辑器","Save profile →":"保存个人资料 →",
  "MEET US":"认识我们","THE FOUNDING TEAM":"创始团队","WHAT WE BELIEVE":"我们的理念","TRUST CENTER":"诚信与安全中心",
  "Useful evidence needs":"有价值的证据需要","visible rules.":"清晰可见的规则。","HELP CENTER":"帮助中心","Start with the workflow.":"从使用流程开始。",
  "Keep the rules clear.":"保持规则清晰。","Membership terms":"会员条款","Continue free":"继续使用免费版","View membership options →":"查看会员方案 →",
});

Object.assign(interfaceTranslations.es,{
  "ONE NETWORK · THREE PERSPECTIVES":"UNA RED · TRES PERSPECTIVAS","Turn uncertainty":"Convierte la incertidumbre","into evidence.":"en evidencia.",
  "Secure identity, role-specific workspaces, and feedback that compounds into reputation.":"Identidad segura, espacios por rol y aportes que construyen reputación.",
  "IDENTITY VERIFIED":"IDENTIDAD VERIFICADA","Make InsightLab yours.":"Crea tu identidad en InsightLab.",
  "Choose the role that should shape your first workspace. You can expand your profile at any time.":"Elige el rol de tu primer espacio. Podrás ampliar tu perfil después.",
  "Short introduction":"Presentación breve","Publish and validate ideas":"Publica y valida ideas","Review ideas and build reputation":"Evalúa ideas y construye reputación",
  "Track evidence and emerging signal":"Sigue evidencia y señales emergentes","SECURE ACCESS":"ACCESO SEGURO","Enter InsightLab.":"Entra en InsightLab.",
  "Only registered InsightLab identities can sign in.":"Solo las identidades registradas pueden iniciar sesión.","or use a verification code":"o usa un código",
  "Phone":"Teléfono","Verification code":"Código de verificación","Send another code":"Enviar otro código","Preparing secure sign-in…":"Preparando acceso seguro…",
  "FOUNDER VALIDATION STUDIO":"ESTUDIO DE VALIDACIÓN","Frame":"Definir","Design":"Diseñar","Preview":"Vista previa","Idea only":"Solo idea",
  "Rating + open feedback":"Valoración y comentarios","Guided survey":"Encuesta guiada","Custom questions + analysis":"Preguntas y análisis personalizados",
  "Public discovery":"Descubrimiento público","Targeted audience":"Audiencia específica","Private link":"Enlace privado","GitHub repository":"Repositorio de GitHub",
  "PERSONALIZED QUESTIONNAIRE":"CUESTIONARIO PERSONALIZADO","Add question":"Añadir pregunta","Required":"Obligatoria","Research design check":"Revisión del diseño",
  "CONTRIBUTOR DISCOVERY":"DESCUBRIMIENTO PARA COLABORADORES","All":"Todo","Choose response →":"Elegir respuesta →","Verified founder":"Fundador verificado",
  "Reset discovery":"Restablecer","No exact matches.":"No hay coincidencias exactas.","Try another category or a shorter search phrase.":"Prueba otra categoría o una búsqueda más corta.",
  "CONTRIBUTOR · PERSONAL INSIGHTS":"COLABORADOR · DATOS PERSONALES","Your comments created":"Tus comentarios crearon","measurable value.":"valor medible.",
  "Review every idea you helped sharpen, how the integrity model weighted your reasoning, and the points each contribution earned.":"Revisa las ideas que mejoraste, el peso de tu razonamiento y los puntos obtenidos.",
  "POINTS OVER TIME":"PUNTOS A LO LARGO DEL TIEMPO","No contributions yet.":"Aún no hay contribuciones.","Explore ideas →":"Explorar ideas →",
  "INVESTOR SIGNAL DESK":"PANEL DE SEÑALES PARA INVERSORES","CATEGORY MOMENTUM":"TENDENCIA POR CATEGORÍA","HIGH-SIGNAL PROJECTS":"PROYECTOS DESTACADOS",
  "INVESTOR · INTERACTIVE INSIGHTS":"INVERSOR · DATOS INTERACTIVOS","Interrogate the signal,":"Analiza la señal,","not just the score.":"no solo la puntuación.",
  "DEMO MARKET DATA":"DATOS DE MERCADO DE DEMOSTRACIÓN","EVIDENCE INSPECTOR":"INSPECTOR DE EVIDENCIA","Problem resonance":"Resonancia del problema",
  "Response quality":"Calidad de respuesta","Learning velocity":"Velocidad de aprendizaje","Execution readiness":"Preparación de ejecución",
  "PROFILE EDITOR":"EDITOR DE PERFIL","Save profile →":"Guardar perfil →","MEET US":"CONÓCENOS","THE FOUNDING TEAM":"EQUIPO FUNDADOR",
  "WHAT WE BELIEVE":"NUESTROS PRINCIPIOS","TRUST CENTER":"CENTRO DE CONFIANZA","Useful evidence needs":"La evidencia útil necesita",
  "visible rules.":"reglas visibles.","HELP CENTER":"CENTRO DE AYUDA","Start with the workflow.":"Empieza por el flujo de trabajo.",
  "Keep the rules clear.":"Mantén las reglas claras.","Membership terms":"Condiciones de membresía","Continue free":"Continuar gratis",
  "View membership options →":"Ver membresías →",
});

Object.assign(interfaceTranslations.zh,{
  "BUILT SO FAR":"已完成的基础","A working foundation,":"已经可运行的基础，","not a slide-deck promise.":"而不是停留在演示文稿里的承诺。",
  "CHOOSE YOUR ENTRY POINT":"选择你的入口","Three ways to create value.":"三种创造价值的方式。","HOW THE LOOP WORKS":"平台如何循环运作",
  "GENERAL INSIGHTS":"平台总览","See the whole network":"查看整个网络","move as one system.":"如何作为一个系统运转。",
  "Open platform overview ↗":"打开平台总览 ↗","CONNECTED ECOSYSTEM":"全球合作网络","Click a light to focus its region":"点击亮点查看对应区域",
  "Drag-free auto rotation":"自动平稳旋转","INSIGHT MODEL · LIVE":"洞察模型 · 实时","Every response is analyzed.":"每条反馈都会被分析。",
  "Not every response is weighted equally.":"但并非每条反馈权重都相同。","Specificity":"具体程度","Constructiveness":"建设性",
  "Domain relevance":"领域相关性","Consistency":"一致性","Duplicate risk":"重复风险","GENERAL · PLATFORM INSIGHTS":"公共平台 · 数据总览",
  "One network.":"一个网络。","One readable pulse.":"一套清晰可读的信号。","ACTIVE IDEAS":"活跃创意","VERIFIED FEEDBACK":"已验证反馈",
  "NETWORK MEMBERS":"平台成员","ONLINE NOW":"当前在线","ROLE COMPOSITION":"身份构成","7-DAY NETWORK ACTIVITY":"7 天平台活动",
  "FOUNDER SIGNAL":"创业者信号","CONTRIBUTOR VALUE":"贡献者价值","INVESTOR DISCOVERY":"投资人发现","PUBLIC DATA STANDARD":"公共数据标准",
  "One score,":"一个分数，","recalculated after every contribution.":"每次贡献后重新计算。","Prior reputation":"原信誉分",
  "New reputation":"新信誉分","BEFORE PUBLIC LAUNCH":"公开发布前","QUICK MAP":"快速导航","Getting started":"开始使用",
  "Studies & surveys":"创意验证与问卷","Points & reputation":"积分与信誉","Privacy & access":"隐私与访问","Login & accounts":"登录与账号",
  "OWNER CONSOLE":"站长管理后台","AUTHENTICATION REQUIRED":"需要身份验证","The control room":"管理中心","is not connected yet.":"尚未完成连接。",
  "SEPARATE ADMIN ACCESS":"独立管理入口","Verify the owner":"验证站长身份","before entering.":"后进入后台。",
  "This route is separate from the public website and does not appear in its navigation.":"此后台与公共网站分离，不会出现在公共导航中。",
  "Continue with Google":"使用 Google 登录","or use owner email OTP":"或使用站长邮箱验证码","Owner email":"站长邮箱",
  "Send verification code →":"发送验证码 →","Verify & open console →":"验证并打开后台 →","Return to public website":"返回公共网站",
  "ACCESS DENIED":"拒绝访问","This identity is verified,":"此身份已通过验证，","but it is not the owner.":"但不是站长账号。",
  "Password":"密码","Confirm password":"确认密码","New password":"新密码","Confirm new password":"确认新密码",
  "At least 8 characters":"至少 8 个字符","Enter it again":"再次输入密码","Forgot password?":"忘记密码？",
  "← Back to sign in":"← 返回登录","Sign in →":"登录 →","Create account →":"创建账号 →",
  "Send password reset email →":"发送密码重置邮件 →","Update password →":"更新密码 →",
  "PASSWORD RECOVERY":"密码恢复","Choose a new password.":"设置新密码。",
  "Your reset link is verified. Set a new password to protect your InsightLab account.":"重置链接已验证。请设置新密码以保护你的 InsightLab 账号。",
  "or use email and password":"或使用邮箱和密码","or use owner email and password":"或使用站长邮箱和密码",
  "Sign in to console →":"登录管理后台 →",
});

Object.assign(interfaceTranslations.es,{
  "BUILT SO FAR":"BASE CONSTRUIDA","A working foundation,":"Una base funcional,","not a slide-deck promise.":"no una promesa en diapositivas.",
  "CHOOSE YOUR ENTRY POINT":"ELIGE TU ENTRADA","Three ways to create value.":"Tres formas de crear valor.","HOW THE LOOP WORKS":"CÓMO FUNCIONA EL CICLO",
  "GENERAL INSIGHTS":"DATOS GENERALES","See the whole network":"Observa toda la red","move as one system.":"funcionar como un sistema.",
  "Open platform overview ↗":"Abrir resumen de plataforma ↗","CONNECTED ECOSYSTEM":"ECOSISTEMA CONECTADO",
  "Click a light to focus its region":"Pulsa una luz para ver su región","Drag-free auto rotation":"Rotación automática estable",
  "INSIGHT MODEL · LIVE":"MODELO DE INSIGHT · ACTIVO","Every response is analyzed.":"Cada respuesta se analiza.",
  "Not every response is weighted equally.":"No todas las respuestas tienen el mismo peso.","Specificity":"Especificidad",
  "Constructiveness":"Valor constructivo","Domain relevance":"Relevancia del dominio","Consistency":"Consistencia","Duplicate risk":"Riesgo de duplicación",
  "GENERAL · PLATFORM INSIGHTS":"GENERAL · DATOS DE PLATAFORMA","One network.":"Una red.","One readable pulse.":"Una señal comprensible.",
  "ACTIVE IDEAS":"IDEAS ACTIVAS","VERIFIED FEEDBACK":"APORTES VERIFICADOS","NETWORK MEMBERS":"MIEMBROS","ONLINE NOW":"EN LÍNEA",
  "ROLE COMPOSITION":"COMPOSICIÓN POR ROL","7-DAY NETWORK ACTIVITY":"ACTIVIDAD DE 7 DÍAS","FOUNDER SIGNAL":"SEÑAL DE FUNDADORES",
  "CONTRIBUTOR VALUE":"VALOR DE COLABORADORES","INVESTOR DISCOVERY":"DESCUBRIMIENTO PARA INVERSORES","PUBLIC DATA STANDARD":"ESTÁNDAR DE DATOS PÚBLICOS",
  "One score,":"Una puntuación,","recalculated after every contribution.":"actualizada tras cada contribución.","Prior reputation":"Reputación anterior",
  "New reputation":"Nueva reputación","BEFORE PUBLIC LAUNCH":"ANTES DEL LANZAMIENTO PÚBLICO","QUICK MAP":"MAPA RÁPIDO",
  "Getting started":"Primeros pasos","Studies & surveys":"Estudios y encuestas","Points & reputation":"Puntos y reputación",
  "Privacy & access":"Privacidad y acceso","Login & accounts":"Acceso y cuentas",
  "OWNER CONSOLE":"CONSOLA DEL PROPIETARIO","AUTHENTICATION REQUIRED":"AUTENTICACIÓN OBLIGATORIA","The control room":"El centro de control",
  "is not connected yet.":"aún no está conectado.","SEPARATE ADMIN ACCESS":"ACCESO ADMINISTRATIVO SEPARADO",
  "Verify the owner":"Verifica al propietario","before entering.":"antes de entrar.",
  "This route is separate from the public website and does not appear in its navigation.":"Esta ruta está separada del sitio público y no aparece en su navegación.",
  "Continue with Google":"Continuar con Google","or use owner email OTP":"o usa el código del correo del propietario","Owner email":"Correo del propietario",
  "Send verification code →":"Enviar código →","Verify & open console →":"Verificar y abrir →","Return to public website":"Volver al sitio público",
  "ACCESS DENIED":"ACCESO DENEGADO","This identity is verified,":"Esta identidad está verificada,","but it is not the owner.":"pero no pertenece al propietario.",
  "Password":"Contraseña","Confirm password":"Confirmar contraseña","New password":"Nueva contraseña",
  "Confirm new password":"Confirmar nueva contraseña","At least 8 characters":"Mínimo 8 caracteres",
  "Enter it again":"Escríbela de nuevo","Forgot password?":"¿Olvidaste la contraseña?","← Back to sign in":"← Volver al acceso",
  "Sign in →":"Iniciar sesión →","Create account →":"Crear cuenta →","Send password reset email →":"Enviar correo de recuperación →",
  "Update password →":"Actualizar contraseña →","PASSWORD RECOVERY":"RECUPERAR CONTRASEÑA",
  "Choose a new password.":"Elige una nueva contraseña.",
  "Your reset link is verified. Set a new password to protect your InsightLab account.":"El enlace está verificado. Establece una nueva contraseña para proteger tu cuenta.",
  "or use email and password":"o usa correo y contraseña","or use owner email and password":"o usa el correo y la contraseña del propietario",
  "Sign in to console →":"Entrar a la consola →",
});

export function useInterfaceTranslation(locale:Locale){
  useEffect(()=>{
    const translate=()=>{
      const dictionary=locale==="en"?null:interfaceTranslations[locale];
      document.querySelectorAll("body *").forEach(element=>{
        ["placeholder","title","aria-label"].forEach(attribute=>{
          const current=element.getAttribute(attribute);
          if(!current)return;
          const sourceKey=`data-i18n-${attribute.replace("aria-","")}`;
          if(!element.hasAttribute(sourceKey))element.setAttribute(sourceKey,current);
          const original=element.getAttribute(sourceKey)??current;
          element.setAttribute(attribute,dictionary?.[original]??original);
        });
        element.childNodes.forEach(node=>{
          if(node.nodeType!==Node.TEXT_NODE)return;
          const textNode=node as Text;
          const current=textNode.data;
          if(!current.trim())return;
          if(!originalInterfaceText.has(textNode))originalInterfaceText.set(textNode,current);
          const original=originalInterfaceText.get(textNode)??current;
          const key=original.trim();
          const translated=dictionary?.[key]??key;
          const leading=original.match(/^\s*/)?.[0]??"";
          const trailing=original.match(/\s*$/)?.[0]??"";
          textNode.data=`${leading}${translated}${trailing}`;
        });
      });
    };
    translate();
    const observer=new MutationObserver(translate);
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>observer.disconnect();
  },[locale]);
}

function isLocale(value:unknown):value is Locale {
  return value==="en"||value==="zh"||value==="es";
}

function LanguageSwitcher({locale,onChange,showLabel=false}:{locale:Locale;onChange:(locale:Locale)=>void;showLabel?:boolean}) {
  return <div className={`language-switcher${showLabel?" labeled":""}`} role="group" aria-label="Interface language">
    {showLabel&&<span>Language</span>}
    <div>{languageOptions.map(option=><button type="button" key={option.value} className={locale===option.value?"active":""} onClick={()=>onChange(option.value)} aria-pressed={locale===option.value} title={option.longLabel}>{option.label}</button>)}</div>
  </div>;
}

function mapAuthUser(user:SupabaseUser):AuthUser {
  return {
    id:user.id,
    displayName:String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email?.split("@")[0] ?? user.phone ?? "InsightLab member"),
    email:user.email?.toLowerCase() ?? null,
    phone:user.phone ?? null,
  };
}

function withAuthTimeout<T>(request:Promise<T>, milliseconds=15_000):Promise<T> {
  return new Promise((resolve,reject)=>{
    const timer=window.setTimeout(()=>reject(new Error("AUTH_REQUEST_TIMEOUT")),milliseconds);
    request.then(value=>{
      window.clearTimeout(timer);
      resolve(value);
    },reason=>{
      window.clearTimeout(timer);
      reject(reason);
    });
  });
}

function readableAuthError(error:unknown):string {
  const value=error as {message?:unknown;code?:unknown;status?:unknown}|null;
  const message=typeof value?.message==="string"?value.message.trim():"";
  const code=typeof value?.code==="string"?value.code:"";
  if(!message||message==="{}"||message==="[object Object]"){
    return "Supabase rejected the request without a readable message. For Resend, use smtp.resend.com, port 587 (STARTTLS), username resend, and your re_ API key—not port 465.";
  }
  if(/sending confirmation email|smtp|email.*send/i.test(message)){
    return `Supabase could not hand the message to Resend. Recheck the SMTP settings and API key.${code?` (${code})`:""}`;
  }
  if(/rate limit/i.test(message)){
    return "Too many authentication requests. Wait at least 60 seconds, then try once more.";
  }
  if(/invalid login credentials/i.test(message)){
    return "The email or password is incorrect. If you have not registered, create an account first.";
  }
  if(/user already registered/i.test(message)){
    return "This email is already registered. Sign in or use Forgot password.";
  }
  if(/password should be at least/i.test(message)){
    return "Use a password with at least 8 characters.";
  }
  return code?`${message} (${code})`:message;
}

export default function InsightLabApp() {
  const [authOpen, setAuthOpen] = useState(false);
  const [role, setRole] = useState<Role>("founder");
  const [locale, setLocale] = useState<Locale>("en");
  const [view, setView] = useState<View>("home");
  const [termsOpen, setTermsOpen] = useState(false);
  const [profileName, setProfileName] = useState("InsightLab member");
  const [authUser, setAuthUser] = useState<AuthUser|null>(null);
  const [profile, setProfile] = useState<UserProfile|null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [authClient, setAuthClient] = useState<SupabaseClient|null>(null);
  const [authConfigured, setAuthConfigured] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authProviders, setAuthProviders] = useState<AuthProviders>({email:false,phone:false,google:false,github:false});
  const [navVisible, setNavVisible] = useState(false);
  const [typed, setTyped] = useState("");
  const [typeIndex, setTypeIndex] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  const content = roleContent[role];
  const copy = uiCopy[locale];
  useInterfaceTranslation(locale);
  const isGeneralView=view === "home" || view === "platform-insights" || view === "meet" || view === "trust" || view === "help";
  const insightView:View = isGeneralView
    ? "platform-insights"
    : role === "contributor"
      ? "contributor-insights"
      : role === "investor"
        ? "investor-insights"
        : "analytics";

  const changeLocale=useCallback((next:Locale)=>{
    setLocale(next);
    setTyped("");
    setTypeIndex(0);
    setDeleting(false);
    window.localStorage.setItem("insightlab-language",next);
    document.documentElement.lang=next==="zh"?"zh-CN":next;
  },[]);

  useEffect(()=>{
    const saved=window.localStorage.getItem("insightlab-language");
    if(!isLocale(saved))return;
    const timer=window.setTimeout(()=>changeLocale(saved),0);
    return()=>window.clearTimeout(timer);
  },[changeLocale]);

  useEffect(() => {
    const target = copy.landing.typed[typeIndex % copy.landing.typed.length];
    const timer = window.setTimeout(() => {
      if (!deleting && typed.length < target.length) setTyped(target.slice(0, typed.length + 1));
      else if (!deleting && typed.length === target.length) setDeleting(true);
      else if (deleting && typed.length > 0) setTyped(target.slice(0, typed.length - 1));
      else { setDeleting(false); setTypeIndex(i => i + 1); }
    }, !deleting && typed.length === target.length ? 1400 : deleting ? 26 : 58);
    return () => window.clearTimeout(timer);
  }, [typed, deleting, typeIndex, copy.landing.typed]);

  useEffect(() => {
    let active = true;
    let unsubscribe:(()=>void)|undefined;
    fetch("/api/auth/config")
      .then(response=>response.json())
      .then((config:{configured:boolean;url:string|null;publishableKey:string|null;providers?:AuthProviders})=>{
        if(!active)return;
        setAuthProviders(config.providers??{email:false,phone:false,google:false,github:false});
        if(!config.configured||!config.url||!config.publishableKey){
          setAuthConfigured(false);
          setAuthReady(true);
          return;
        }
        const client=createClient(config.url,config.publishableKey,{
          auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true},
        });
        setAuthClient(client);
        setAuthConfigured(true);
        client.auth.getSession().then(({data})=>{
          if(!active)return;
          if(data.session)setProfileLoaded(false);
          setAuthUser(data.session?.user?mapAuthUser(data.session.user):null);
          if(!data.session)setProfile(null);
          setAuthReady(true);
        });
        const listener=client.auth.onAuthStateChange((event,session)=>{
          if(active){
            if(session)setProfileLoaded(false);
            setAuthUser(session?.user?mapAuthUser(session.user):null);
            if(!session)setProfile(null);
            if(event==="PASSWORD_RECOVERY"){
              setPasswordRecovery(true);
              setAuthOpen(true);
            } else if(event==="SIGNED_IN")setAuthOpen(true);
          }
        });
        unsubscribe=()=>listener.data.subscription.unsubscribe();
      })
      .catch(()=>{if(active){setAuthConfigured(false);setAuthReady(true);}});
    return()=>{active=false;unsubscribe?.();};
  },[]);

  const apiFetch=useCallback<ApiFetch>(async(input,init={})=>{
    const session=authClient?await authClient.auth.getSession():null;
    const headers=new Headers(init.headers);
    const token=session?.data.session?.access_token;
    if(token)headers.set("authorization",`Bearer ${token}`);
    return fetch(input,{...init,headers});
  },[authClient]);

  useEffect(()=>{
    if(!authUser||!authClient)return;
    let active=true;
    apiFetch("/api/profile")
      .then(response=>response.ok?response.json():null)
      .then((data:{profile?:UserProfile|null}|null)=>{
        if(!active)return;
        const next=data?.profile??null;
        setProfile(next);
        if(next){
          setRole(next.role);
          setProfileName(next.displayName);
          if(isLocale(next.preferredLanguage))changeLocale(next.preferredLanguage);
        }else{
          setProfileName(authUser.displayName);
        }
        setProfileLoaded(true);
      })
      .catch(()=>{if(active)setProfileLoaded(true);});
    return()=>{active=false;};
  },[authUser,authClient,apiFetch,changeLocale]);

  const selectLocale=useCallback((next:Locale)=>{
    changeLocale(next);
    if(!profile)return;
    const optimistic={...profile,preferredLanguage:next};
    setProfile(optimistic);
    void apiFetch("/api/profile",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({role:optimistic.role,displayName:optimistic.displayName,interests:optimistic.interests,headline:optimistic.headline,bio:optimistic.bio,location:optimistic.location,website:optimistic.website,preferredLanguage:next}),
    }).then(async response=>{
      if(!response.ok)return;
      const data=await response.json() as {profile:UserProfile};
      setProfile(data.profile);
    }).catch(()=>undefined);
  },[apiFetch,changeLocale,profile]);

  useEffect(()=>{
    const update=()=>setNavVisible(window.scrollY>Math.min(480,window.innerHeight*.55));
    update();
    window.addEventListener("scroll",update,{passive:true});
    return()=>window.removeEventListener("scroll",update);
  },[]);

  useEffect(()=>{
    window.scrollTo({top:0,behavior:"auto"});
  },[view]);

  useEffect(() => {
    if (!authUser || !profile) return;
    let active = true;
    const heartbeat = async () => {
      try {
        const response = await apiFetch("/api/presence", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ view }),
        });
        if (response.ok) {
          const data = await response.json() as { online: number };
          if (active) setOnlineCount(data.online);
        }
      } catch { /* The UI remains usable if presence is temporarily unavailable. */ }
    };
    heartbeat();
    const timer = window.setInterval(heartbeat, 30_000);
    const onVisibility = () => { if (document.visibilityState === "visible") heartbeat(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [authUser, profile, view, apiFetch]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  };

  const enterApp = (selectedRole: Role, tier = "free", showTerms = false) => {
    setRole(selectedRole);
    setAuthOpen(false);
    setView(selectedRole);
    setTermsOpen(showTerms && tier === "free");
    window.scrollTo({top:0,behavior:"smooth"});
  };

  const register = async (details:{role:Role;displayName:string;headline:string;bio:string;interests:string[]}) => {
    setAuthBusy(true);
    try {
      const response = await apiFetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({...details,preferredLanguage:locale}),
      });
      if (response.ok){
        const data=await response.json() as {profile:UserProfile};
        setProfile(data.profile);
        setProfileName(data.profile.displayName);
        setRole(data.profile.role);
        const sessionResult=authClient?await authClient.auth.getSession():null;
        if(!hasVerifiedSupabaseSession(sessionResult)){
          setProfile(null);
          setAuthUser(null);
          setProfileLoaded(true);
          notify(locale==="zh"?"请先验证邮箱，然后返回登录。":locale==="es"?"Verifica tu correo electrónico y vuelve para iniciar sesión.":"Verify your email, then return to sign in.");
          return false;
        }
        setProfileLoaded(true);
        enterApp(data.profile.role,data.profile.memberTier);
        notify(locale==="zh"?"欢迎加入 InsightLab，你的工作台已准备就绪。":locale==="es"?"Te damos la bienvenida a InsightLab. Tu espacio ya está listo.":"Welcome to InsightLab. Your workspace is ready.");
        return true;
      }
      else notify("We could not create the profile yet. Please try again.");
    } finally { setAuthBusy(false); }
    return false;
  };

  const startUsing = (preferredRole?:Role) => {
    if(preferredRole)setRole(preferredRole);
    if(authUser&&profile)enterApp(profile.role,profile.memberTier);
    else setAuthOpen(true);
  };

  const signOut=async()=>{
    await authClient?.auth.signOut();
    setProfile(null);
    setAuthUser(null);
    setView("home");
    window.scrollTo({top:0,behavior:"smooth"});
  };

  if (authOpen) {
    return <AuthGateway
      client={authClient} configured={authConfigured} ready={authReady}
      providers={authProviders}
      user={authUser} profile={profile} profileLoaded={profileLoaded}
      busy={authBusy} preferredRole={role} recovery={passwordRecovery}
      onRecoveryComplete={()=>setPasswordRecovery(false)} onRegister={register}
      onBack={()=>setAuthOpen(false)} onOpenProfile={()=>profile&&enterApp(profile.role,profile.memberTier)}
      onDemo={(selectedRole)=>enterApp(selectedRole,"demo")}
    />;
  }

  return (
    <main className="site-shell refreshed" data-locale={locale}>
      <PointerEffects />
      <header className={`nav reveal-nav ${view!=="home"||navVisible?"visible":""}`}>
        <button className="brand" onClick={() => setView("home")} aria-label="InsightLab home">
          <span className="brand-mark"><i /><i /><i /></span><span>Insight<span>Lab</span></span>
        </button>
        <nav className="nav-links">
          <button className={view === "home" ? "active" : ""} onClick={() => setView("home")}>{copy.nav.home}</button>
          <button className={view === role ? "active" : ""} onClick={() => startUsing()}>{copy.nav.workspace}</button>
          <button className={view === "platform-insights" || view === "analytics" || view === "contributor-insights" || view === "investor-insights" ? "active" : ""} onClick={() => setView(insightView)}>{copy.nav.insights}</button>
          <button className={view === "meet" ? "active" : ""} onClick={() => setView("meet")}>{copy.nav.meet}</button>
          {profile&&<button className={view === "profile" ? "active" : ""} onClick={() => setView("profile")}>{copy.nav.profile}</button>}
        </nav>
        <div className="nav-actions">
          <LanguageSwitcher locale={locale} onChange={selectLocale}/>
          <span className="role-pill">{isGeneralView ? copy.nav.general : content.label}</span>
          <button className="avatar" onClick={() => profile?setView("profile"):startUsing()}>{profileName.split(/\s/).map(x => x[0]).slice(0,2).join("").toUpperCase()}</button>
        </div>
      </header>

      {view === "home" && <>
        <section className="hero new-hero">
          <div className="grain" />
          <MeteorField />
          <button className="hero-brand" onClick={()=>window.scrollTo({top:0,behavior:"smooth"})} aria-label="InsightLab home">
            <span className="brand-mark"><i/><i/><i/></span><span>Insight<span>Lab</span></span>
          </button>
          <div className="hero-top-actions"><LanguageSwitcher locale={locale} onChange={selectLocale}/><button className="hero-signin" onClick={()=>startUsing()}>{authUser&&profile?copy.landing.openWorkspace:copy.landing.signIn} <span>↗</span></button></div>
          <div className="hero-copy">
            <div className="eyebrow"><span /> {copy.landing.eyebrow}</div>
            <h1><span className="hero-prefix">{copy.landing.prefix}</span><span className="typed-line"><em>{typed}</em><i className="type-caret" /></span></h1>
            <p>{copy.landing.description}</p>
            <div className="hero-actions">
              <button className="primary" onClick={()=>startUsing()}>{copy.landing.start} <b>↗</b></button>
              <button className="ghost" onClick={() => setView("meet")}>{copy.landing.meet} <span>→</span></button>
            </div>
            <div className="hero-micro">
              <span>● {authUser&&profile ? onlineCount === null ? copy.landing.connecting : `${onlineCount} ${copy.landing.online}` : copy.landing.publicNetwork}</span>
              <i />{copy.landing.roles}<i />{copy.landing.review}
            </div>
          </div>
          <SignalSculpture role="founder" />
        </section>

        <PlatformMilestones />
        <RolePathways onChoose={startUsing}/>
        <HowItWorks />
        <PlatformPulseTeaser onOpen={()=>{setView("platform-insights");window.scrollTo({top:0,behavior:"smooth"});}} />

        <EcosystemGlobe />

        <section className="model-strip">
          <div><span>INSIGHT MODEL · LIVE</span><h2>Every response is analyzed.<br />Not every response is weighted equally.</h2></div>
          <div className="model-formula">
            {["Specificity", "Constructiveness", "Domain relevance", "Consistency", "Duplicate risk"].map((x, i) => <div key={x}><b>{String(i + 1).padStart(2, "0")}</b><span>{x}</span><i style={{ width: `${[88,82,76,93,12][i]}%` }} /></div>)}
          </div>
          <button onClick={() => setView("platform-insights")}>Explore the platform pulse ↗</button>
        </section>
      </>}

      {view === "platform-insights" && <PlatformInsights onStart={startUsing} />}
      {view === "founder" && <FounderWorkspace notify={notify} setView={setView} apiFetch={apiFetch} isDemo={!profile} onSignIn={()=>startUsing("founder")} />}
      {view === "contributor" && <ContributorWorkspace notify={notify} apiFetch={apiFetch} isDemo={!profile} locale={locale} reputation={profile?.reputationScore??742} onSignIn={()=>startUsing("contributor")} onReputation={next=>setProfile(current=>current?{...current,reputationScore:next}:current)} />}
      {view === "contributor-insights" && <ContributorInsights apiFetch={apiFetch} onExplore={()=>setView("contributor")} />}
      {view === "investor" && <InvestorWorkspace isDemo={!profile} onSignIn={()=>startUsing("investor")} onInsights={()=>setView("investor-insights")} />}
      {view === "investor-insights" && <InvestorInsights onWorkspace={()=>setView("investor")} />}
      {view === "analytics" && <AnalyticsModel apiFetch={apiFetch} />}
      {view === "rewards" && <Rewards notify={notify} apiFetch={apiFetch} locale={locale} signedIn={Boolean(profile)} onSignIn={()=>startUsing()} />}
      {view === "meet" && <MeetUs />}
      {view === "trust" && <TrustCenter />}
      {view === "help" && <HelpCenter onStart={()=>startUsing()} />}
      {view === "profile" && profile && <ProfilePage profile={profile} apiFetch={apiFetch} locale={locale} onLocaleChange={selectLocale} onSaved={next=>{setProfile(next);setProfileName(next.displayName);if(isLocale(next.preferredLanguage))changeLocale(next.preferredLanguage);}} notify={notify}/>}

      {!isGeneralView&&<nav className="mobile-app-nav" aria-label="App navigation">
        <button className={view===role?"active":""} onClick={()=>startUsing()}><i>⌂</i><span>{locale==="zh"?"工作台":locale==="es"?"Espacio":"Workspace"}</span></button>
        <button className={view===insightView?"active":""} onClick={()=>setView(insightView)}><i>◉</i><span>{locale==="zh"?"洞察":locale==="es"?"Datos":"Insights"}</span></button>
        <button className={view==="rewards"?"active":""} onClick={()=>setView("rewards")}><i>◇</i><span>{locale==="zh"?"积分":locale==="es"?"Puntos":"Rewards"}</span></button>
        <button className={view==="profile"?"active":""} onClick={()=>profile?setView("profile"):startUsing()}><i>●</i><span>{locale==="zh"?"我的":locale==="es"?"Perfil":"Profile"}</span></button>
      </nav>}

      <footer>
        <div className="brand footer-brand"><span className="brand-mark"><i/><i/><i/></span><span>Insight<span>Lab</span></span></div>
        <p>{copy.footer.tagline}</p>
        <div><button onClick={() => setView("platform-insights")}>{copy.footer.insights}</button><button onClick={() => setTermsOpen(true)}>{copy.footer.terms}</button><button onClick={() => setView("trust")}>{copy.footer.trust}</button><button onClick={() => setView("help")}>{copy.footer.help}</button><button onClick={() => setView("meet")}>{copy.footer.meet}</button>{authUser?<button onClick={signOut}>{copy.footer.signOut}</button>:<button onClick={()=>startUsing()}>{copy.footer.signIn}</button>}</div>
        <small>{copy.footer.copyright}</small>
      </footer>

      {termsOpen && <MembershipTerms role={role} onClose={() => setTermsOpen(false)} onUpgrade={() => { setTermsOpen(false); notify("Membership options saved for review"); }} />}
      {toast && <div className="toast">✓ {toast}</div>}
    </main>
  );
}

function PointerEffects() {
  const glowRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const finePointer = window.matchMedia("(pointer:fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion:reduce)");
    if (!finePointer.matches || reducedMotion.matches) return;
    const points = Array.from({length:9},()=>({x:-100,y:-100}));
    let target={x:-100,y:-100};
    let frame=0;
    const move = (event:PointerEvent) => {
      target={x:event.clientX,y:event.clientY};
      glowRef.current?.style.setProperty("transform", `translate3d(${event.clientX - 190}px,${event.clientY - 190}px,0)`);
      ringRef.current?.style.setProperty("transform", `translate3d(${event.clientX - 13}px,${event.clientY - 13}px,0)`);
      const interactive = event.target instanceof Element && Boolean(event.target.closest("button,a,input,textarea,select,canvas"));
      ringRef.current?.classList.toggle("interactive", interactive);
    };
    const animate=()=>{
      let leader=target;
      const nodes=trailRef.current?.children;
      points.forEach((point,index)=>{
        const ease=index===0?.34:.42;
        point.x+=(leader.x-point.x)*ease;
        point.y+=(leader.y-point.y)*ease;
        const node=nodes?.item(index) as HTMLElement|null;
        node?.style.setProperty("transform",`translate3d(${point.x}px,${point.y}px,0) scale(${1-index*.065})`);
        leader=point;
      });
      frame=window.requestAnimationFrame(animate);
    };
    frame=window.requestAnimationFrame(animate);
    const click = (event:PointerEvent) => {
      const ripple = document.createElement("span");
      ripple.className = "pointer-click";
      ripple.style.left = `${event.clientX}px`;
      ripple.style.top = `${event.clientY}px`;
      document.body.appendChild(ripple);
      window.setTimeout(() => ripple.remove(), 650);
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", click, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", click);
    };
  }, []);
  return <><div className="pointer-aurora" ref={glowRef}/><div className="pointer-trail" ref={trailRef}>{Array.from({length:9},(_,index)=><i key={index}/>)}</div><div className="pointer-ring" ref={ringRef}/></>;
}

function MeteorField(){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const canvas=canvasRef.current;
    if(!canvas||window.matchMedia("(prefers-reduced-motion:reduce)").matches)return;
    const context=canvas.getContext("2d");
    if(!context)return;
    type Meteor={x:number;y:number;length:number;speed:number;alpha:number;width:number;warm:boolean};
    let meteors:Meteor[]=[];
    let frame=0;
    let last=performance.now();
    let nextSpawn=last+500;
    const resize=()=>{
      const bounds=canvas.getBoundingClientRect();
      const ratio=Math.min(window.devicePixelRatio||1,2);
      canvas.width=Math.max(1,Math.floor(bounds.width*ratio));
      canvas.height=Math.max(1,Math.floor(bounds.height*ratio));
      context.setTransform(ratio,0,0,ratio,0,0);
    };
    const spawn=()=>{
      const bounds=canvas.getBoundingClientRect();
      meteors.push({
        x:-140-Math.random()*120,
        y:45+Math.random()*Math.max(120,bounds.height*.72),
        length:70+Math.random()*150,
        speed:150+Math.random()*210,
        alpha:.22+Math.random()*.42,
        width:.7+Math.random()*1.2,
        warm:Math.random()>.28,
      });
    };
    const animate=(now:number)=>{
      const bounds=canvas.getBoundingClientRect();
      const delta=Math.min((now-last)/1000,.05);
      last=now;
      context.clearRect(0,0,bounds.width,bounds.height);
      if(now>=nextSpawn){
        spawn();
        nextSpawn=now+650+Math.random()*1650;
      }
      meteors.forEach(meteor=>{
        meteor.x+=meteor.speed*delta;
        const gradient=context.createLinearGradient(meteor.x-meteor.length,meteor.y+meteor.length*.08,meteor.x,meteor.y);
        gradient.addColorStop(0,"rgba(221,125,83,0)");
        gradient.addColorStop(.82,meteor.warm?`rgba(221,125,83,${meteor.alpha*.68})`:`rgba(167,189,165,${meteor.alpha*.62})`);
        gradient.addColorStop(1,meteor.warm?`rgba(255,222,185,${meteor.alpha})`:`rgba(222,241,221,${meteor.alpha})`);
        context.beginPath();
        context.moveTo(meteor.x-meteor.length,meteor.y+meteor.length*.08);
        context.lineTo(meteor.x,meteor.y);
        context.strokeStyle=gradient;
        context.lineWidth=meteor.width;
        context.lineCap="round";
        context.stroke();
        context.beginPath();
        context.arc(meteor.x,meteor.y,meteor.width*1.45,0,Math.PI*2);
        context.fillStyle=meteor.warm?`rgba(255,232,205,${meteor.alpha})`:`rgba(231,247,229,${meteor.alpha})`;
        context.shadowBlur=12;
        context.shadowColor=meteor.warm?"#d97955":"#8ba68d";
        context.fill();
        context.shadowBlur=0;
      });
      meteors=meteors.filter(meteor=>meteor.x-meteor.length<bounds.width+180);
      frame=window.requestAnimationFrame(animate);
    };
    resize();
    const observer=new ResizeObserver(resize);
    observer.observe(canvas);
    frame=window.requestAnimationFrame(animate);
    return()=>{observer.disconnect();window.cancelAnimationFrame(frame);};
  },[]);
  return <canvas ref={canvasRef} className="meteor-field" aria-hidden="true"/>;
}

function AuthGateway({client,configured,ready,providers,user,profile,profileLoaded,busy,preferredRole,recovery,onRecoveryComplete,onRegister,onBack,onOpenProfile,onDemo}:{
  client:SupabaseClient|null;configured:boolean;ready:boolean;user:AuthUser|null;profile:UserProfile|null;profileLoaded:boolean;
  providers:AuthProviders;
      busy:boolean;preferredRole:Role;recovery:boolean;onRecoveryComplete:()=>void;
  onRegister:(details:{role:Role;displayName:string;headline:string;bio:string;interests:string[]})=>Promise<boolean>;
  onBack:()=>void;onOpenProfile:()=>void;onDemo:(role:Role)=>void;
}) {
  const storedIntent=typeof window!=="undefined"?window.localStorage.getItem("insightlab-auth-intent"):null;
  const [intent,setIntent]=useState<AuthIntent>(storedIntent==="register"?"register":"login");
  const [contact,setContact]=useState("");
  const [password,setPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");
  const [forgotPassword,setForgotPassword]=useState(false);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [selectedRole,setSelectedRole]=useState<Role>(preferredRole);
  const [name,setName]=useState(user?.displayName??"");
  const [headline,setHeadline]=useState("");
  const [bio,setBio]=useState("");
  const [interests,setInterests]=useState<string[]>([]);
  const interestOptions=["AI & Data","Climate","Digital Health","Future of Work","Education","Consumer"];

  useEffect(()=>{
    if(!user||!profileLoaded||recovery)return;
    const activeIntent=window.localStorage.getItem("insightlab-auth-intent")==="register"?"register":"login";
    if(profile){
      window.localStorage.removeItem("insightlab-auth-intent");
      onOpenProfile();
    }else if(activeIntent==="login"&&client){
      void client.auth.signOut();
      window.setTimeout(()=>{
        setError("This Google, GitHub, email, or phone identity is not registered. Please register first.");
        setIntent("login");
      },0);
    }
  },[user,profile,profileLoaded,onOpenProfile,client,recovery]);

  const switchIntent=(next:AuthIntent)=>{
    setIntent(next);setForgotPassword(false);setPassword("");setConfirmPassword("");setError("");setNotice("");
    window.localStorage.setItem("insightlab-auth-intent",next);
  };
  const oauth=async(provider:"google"|"github")=>{
    if(!providers[provider]){
      setError(`${provider==="google"?"Google":"GitHub"} sign-in is not enabled in Supabase yet.`);
      return;
    }
    if(intent==="register"&&name.trim().length<2){
      setError("Add your display name and choose a role before continuing.");
      return;
    }
    if(!client){setError("The authentication service is still loading. Please try again.");return;}
    setWorking(true);setError("");setNotice("");
    window.localStorage.setItem("insightlab-auth-intent",intent);
    try {
      const {error:nextError}=await client.auth.signInWithOAuth({provider,options:{redirectTo:window.location.origin}});
      if(nextError)setError(nextError.message);
    } catch {
      setError(`${provider==="google"?"Google":"GitHub"} sign-in could not be reached. Please try again.`);
    } finally {
      setWorking(false);
    }
  };
  const passwordAuth=async()=>{
    if(!contact.trim()){setError("Enter your email address first.");return;}
    if(password.length<8){setError("Use a password with at least 8 characters.");return;}
    if(intent==="register"&&password!==confirmPassword){setError("The two passwords do not match.");return;}
    if(!providers.email){setError("Email and password authentication is not enabled in Supabase.");return;}
    if(!client){setError("The authentication service is still loading. Refresh the page and try again.");return;}
    if(intent==="register"&&name.trim().length<2){setError("Complete your display name before creating the account.");return;}
    setWorking(true);setError("");setNotice("");
    window.localStorage.setItem("insightlab-auth-intent",intent);
    try {
      const request=intent==="register"
        ?client.auth.signUp({email:contact.trim(),password,options:{data:{display_name:name.trim(),role:selectedRole}}})
        :client.auth.signInWithPassword({email:contact.trim(),password});
      const result=await withAuthTimeout(request);
      if(result.error)setError(readableAuthError(result.error));
      else if(intent==="register"&&!result.data.session){
        setNotice("Account created. Confirm your email from the message we sent, then return to sign in.");
      } else if(intent==="register") {
        setNotice("Account created. Complete your profile to finish registration.");
      }
    } catch (reason) {
      setError(reason instanceof Error&&reason.message==="AUTH_REQUEST_TIMEOUT"
        ?"The authentication service did not respond within 15 seconds. Please try again."
        :"The sign-in request did not complete. Check your connection and try again.");
    } finally {
      setWorking(false);
    }
  };
  const requestPasswordReset=async()=>{
    if(!client||!contact.trim()){setError("Enter the email address for your account first.");return;}
    setWorking(true);setError("");setNotice("");
    try {
      const request=client.auth.resetPasswordForEmail(contact.trim(),{redirectTo:`${window.location.origin}/?reset=1`});
      const result=await withAuthTimeout(request);
      if(result.error)setError(readableAuthError(result.error));
      else setNotice("Password reset email sent. Open its secure link to choose a new password.");
    } catch (reason) {
      setError(reason instanceof Error&&reason.message==="AUTH_REQUEST_TIMEOUT"
        ?"The reset request timed out after 15 seconds. Please try again."
        :"The password reset request could not be completed.");
    } finally {
      setWorking(false);
    }
  };
  const updatePassword=async()=>{
    if(!client||password.length<8){setError("Use a new password with at least 8 characters.");return;}
    if(password!==confirmPassword){setError("The two passwords do not match.");return;}
    setWorking(true);setError("");setNotice("");
    const result=await client.auth.updateUser({password});
    if(result.error)setError(readableAuthError(result.error));
    else {
      await client.auth.signOut();
      setPassword("");setConfirmPassword("");setForgotPassword(false);setIntent("login");
      window.history.replaceState({},document.title,window.location.pathname);
      onRecoveryComplete();
      setNotice("Password updated. Sign in with your new password.");
    }
    setWorking(false);
  };
  const toggleInterest=(interest:string)=>setInterests(current=>current.includes(interest)?current.filter(x=>x!==interest):[...current,interest].slice(0,6));

  return <main className="auth-gateway">
    <PointerEffects />
    <section className="auth-story">
      <button className="auth-back" onClick={onBack}>← Back to InsightLab</button>
      <div className="auth-brand"><span className="brand-mark"><i/><i/><i/></span> Insight<span>Lab</span></div>
      <div className="auth-message"><span>ONE NETWORK · THREE PERSPECTIVES</span><h1>Turn uncertainty<br/><em>into evidence.</em></h1><p>Secure identity, role-specific workspaces, and feedback that compounds into reputation.</p></div>
      <div className="auth-pulse"><i/><i/><i/><i/><i/><i/><i/></div>
      <small>Identity is handled by a dedicated authentication service. InsightLab never stores your password or verification code.</small>
    </section>
    <section className="auth-panel">
      <div className="auth-card expanded">
        {!ready?<div className="auth-loading"><i/><span>Preparing secure sign-in…</span></div>:recovery?<>
          <span className="auth-kicker">PASSWORD RECOVERY</span><h2>Choose a new password.</h2>
          <p>Your reset link is verified. Set a new password to protect your InsightLab account.</p>
          <label className="auth-label">New password<input type="password" autoComplete="new-password" value={password} onChange={event=>setPassword(event.target.value)} placeholder="At least 8 characters"/></label>
          <label className="auth-label">Confirm new password<input type="password" autoComplete="new-password" value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)} placeholder="Enter it again"/></label>
          {error&&<div className="auth-error">{error}</div>}
          <button className="primary auth-submit" disabled={working||password.length<8||confirmPassword.length<8} onClick={updatePassword}>{working?"Please wait…":"Update password →"}</button>
        </>:user&&!profileLoaded?<div className="auth-loading"><i/><span>Loading your InsightLab profile…</span></div>:user&&!profile?<>
          <span className="auth-kicker">IDENTITY VERIFIED</span><h2>Make InsightLab yours.</h2>
          <p>Choose the role that should shape your first workspace. You can expand your profile at any time.</p>
          <label className="auth-label">Display name<input value={name||user.displayName} onChange={event=>setName(event.target.value)} placeholder="Your name"/></label>
          <label className="auth-label">One-line headline<input value={headline} onChange={event=>setHeadline(event.target.value)} placeholder="e.g. Berkeley founder exploring health AI"/></label>
          <div className="role-cards">
            {(["founder","contributor","investor"] as Role[]).map(item=><button key={item} className={selectedRole===item?"selected":""} onClick={()=>setSelectedRole(item)}><span>{item==="founder"?"F":item==="contributor"?"C":"I"}</span><div><b>{roleContent[item].label}</b><small>{item==="founder"?"Publish and validate ideas":item==="contributor"?"Review ideas and build reputation":"Track evidence and emerging signal"}</small></div><i>{selectedRole===item?"●":"○"}</i></button>)}
          </div>
          <label className="auth-label">Short introduction<textarea value={bio} onChange={event=>setBio(event.target.value)} placeholder="What are you building, studying, or especially qualified to evaluate?"/></label>
          <div className="interest-picker">{interestOptions.map(item=><button key={item} className={interests.includes(item)?"active":""} onClick={()=>toggleInterest(item)}>{item}</button>)}</div>
          <button className="primary auth-submit" disabled={busy||(name||user.displayName).trim().length<2} onClick={async()=>{await onRegister({role:selectedRole,displayName:name||user.displayName,headline,bio,interests});}}>{busy?"Creating your account…":"Complete registration →"}</button>
        </>:<>
          <div className="auth-intent-tabs"><button className={intent==="login"?"active":""} onClick={()=>switchIntent("login")}>Sign in</button><button className={intent==="register"?"active":""} onClick={()=>switchIntent("register")}>Create account</button></div>
          <span className="auth-kicker">{intent==="register"?"NEW MEMBER":"SECURE ACCESS"}</span><h2>{intent==="register"?"Create your identity.":"Enter InsightLab."}</h2>
          <p>{intent==="register"?"Complete the basics, create a password, or continue with Google or GitHub.":"Sign in with your registered email and password."}</p>
          {intent==="register"&&<div className="registration-basics">
            <label className="auth-label">Display name<input value={name} onChange={event=>setName(event.target.value)} placeholder="Your name"/></label>
            <label className="auth-label">One-line headline<input value={headline} onChange={event=>setHeadline(event.target.value)} placeholder="What are you building or exploring?"/></label>
            <div className="role-cards compact">{(["founder","contributor","investor"] as Role[]).map(item=><button key={item} className={selectedRole===item?"selected":""} onClick={()=>setSelectedRole(item)}><span>{item[0].toUpperCase()}</span><div><b>{roleContent[item].label}</b></div><i>{selectedRole===item?"●":"○"}</i></button>)}</div>
          </div>}
          {configured?<><div className="oauth-row">
              <button className={`google-auth${providers.google?"":" unavailable"}`} onClick={()=>oauth("google")} disabled={working}><span>G</span>{providers.google?"Google":"Google · unavailable"}</button>
              <button className={`google-auth github-auth${providers.github?"":" unavailable"}`} onClick={()=>oauth("github")} disabled={working}><span>⌘</span>{providers.github?"GitHub":"GitHub · unavailable"}</button>
            </div>
            <div className="auth-divider"><span>or use email and password</span></div>
            <label className="auth-label">Email address
              <input type="email" autoComplete="email" value={contact} onChange={event=>setContact(event.target.value)} placeholder="you@example.com"/>
            </label>
            {!forgotPassword&&<label className="auth-label">Password
              <input type="password" autoComplete={intent==="register"?"new-password":"current-password"} value={password} onChange={event=>setPassword(event.target.value)} placeholder="At least 8 characters"/>
            </label>}
            {intent==="register"&&!forgotPassword&&<label className="auth-label">Confirm password
              <input type="password" autoComplete="new-password" value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)} placeholder="Enter it again"/>
            </label>}
            {error&&<div className="auth-error">{error}</div>}
            {notice&&<div className="auth-notice">{notice}</div>}
            <button className="primary auth-submit" disabled={working||!contact.trim()||(intent==="register"&&name.trim().length<2)||(!forgotPassword&&password.length<8)} onClick={forgotPassword?requestPasswordReset:passwordAuth}>{working?"Please wait…":forgotPassword?"Send password reset email →":intent==="register"?"Create account →":"Sign in →"}</button>
            {intent==="login"&&<button className="resend-code" onClick={()=>{setForgotPassword(value=>!value);setError("");setNotice("");}} disabled={working}>{forgotPassword?"← Back to sign in":"Forgot password?"}</button>}
          </>:<div className="auth-setup-note"><span>AUTH CONNECTION READY FOR SETUP</span><p>The password, Google, and GitHub interface is complete. Connect the project’s Supabase public configuration to activate real authentication.</p></div>}
          <div className="auth-divider"><span>explore before signing up</span></div>
          <div className="demo-role-row">{(["founder","contributor","investor"] as Role[]).map(item=><button key={item} onClick={()=>onDemo(item)}>Preview as {roleContent[item].label}</button>)}</div>
          <small className="auth-security">Encrypted session · Passwords are handled by Supabase · One account per verified identity</small>
        </>}
      </div>
    </section>
  </main>;
}

function PlatformMilestones(){
  const items=[
    {value:"03",label:"role-specific workspaces",visual:"roles"},
    {value:"05",label:"transparent quality signals",visual:"signals"},
    {value:"01",label:"end-to-end validation loop",visual:"loop"},
    {value:"LIVE",label:"database-backed presence",visual:"live"},
  ];
  return <section className="milestones-section"><div className="milestones-intro"><span>BUILT SO FAR</span><h2>A working foundation,<br/><em>not a slide-deck promise.</em></h2><p>These are product capabilities already present in the InsightLab platform—not projected user or partnership numbers.</p></div><div className="milestone-grid">{items.map((item,index)=><article key={item.label}><div className={`milestone-visual ${item.visual}`}>{Array.from({length:index+3},(_,i)=><i key={i}/>)}</div><b>{item.value}</b><span>{item.label}</span></article>)}</div></section>;
}

function RolePathways({onChoose}:{onChoose:(role:Role)=>void}){
  const roles=[
    {role:"founder" as Role,index:"01",title:"Publish the question behind the idea.",copy:"Define the audience, feedback target, reward, and evidence threshold before building.",metric:"VALIDATION"},
    {role:"contributor" as Role,index:"02",title:"Turn perspective into reputation.",copy:"Discover ideas by interest, rate them, explain your reasoning, and earn weighted credibility.",metric:"CONTRIBUTION"},
    {role:"investor" as Role,index:"03",title:"Read signal before consensus.",copy:"Compare resonance, response quality, and founder learning velocity across emerging categories.",metric:"DISCOVERY"},
  ];
  return <section className="role-pathways"><div className="role-pathways-head"><span>CHOOSE YOUR ENTRY POINT</span><h2>One network.<br/><em>Three ways to create value.</em></h2></div><div className="role-path-grid">{roles.map(item=><button key={item.role} onClick={()=>onChoose(item.role)}><span>{item.index}</span><div className={`role-glyph ${item.role}`}><i/><i/><i/><i/></div><small>{item.metric}</small><h3>{item.title}</h3><p>{item.copy}</p><b>Enter as {roleContent[item.role].label} →</b></button>)}</div></section>;
}

function HowItWorks(){
  return <section className="how-section"><div className="how-orbit"><i/><i/><i/><span>IDEA</span><b>EVIDENCE</b></div><div><span>HOW THE LOOP WORKS</span><h2>Feedback becomes useful<br/>when the system gives it structure.</h2><div className="how-steps">{[["Frame","A founder defines the decision and the audience that matters."],["Collect","Matched contributors score, explain, and challenge the idea."],["Weight","Integrity and relevance signals determine analytical influence."],["Learn","The founder receives patterns, objections, and a next experiment."]].map((item,index)=><article key={item[0]}><b>0{index+1}</b><p><strong>{item[0]}</strong><span>{item[1]}</span></p></article>)}</div></div></section>;
}

function PlatformPulseTeaser({onOpen}:{onOpen:()=>void}){
  return <section className="pulse-teaser">
    <div className="pulse-teaser-copy"><span>GENERAL INSIGHTS</span><h2>See the whole network<br/><em>move as one system.</em></h2><p>A public, privacy-safe overview connects founder studies, contributor evidence, and investor discovery without exposing individual responses.</p><button onClick={onOpen}>Open platform overview <b>↗</b></button></div>
    <div className="pulse-flow" aria-label="Animated InsightLab data flow">
      <div className="flow-rail rail-one"/><div className="flow-rail rail-two"/><div className="flow-rail rail-three"/>
      <div className="flow-node founder-node"><span>F</span><b>Founder</b><small>frames the decision</small></div>
      <div className="flow-core"><i/><i/><i/><b>INSIGHT</b><span>weighted signal</span></div>
      <div className="flow-node contributor-node"><span>C</span><b>Contributor</b><small>adds evidence</small></div>
      <div className="flow-node investor-node"><span>I</span><b>Investor</b><small>reads momentum</small></div>
      {Array.from({length:7},(_,index)=><i className={`flow-particle fp-${index+1}`} key={index}/>)}
    </div>
  </section>;
}

type PlatformOverviewData={
  metrics:{users:number;online:number;validations:number;responses:number;averageQuality:number};
  roles:{founder:number;contributor:number;investor:number};
  activity:Array<{day:string;count:number}>;
  asOf:string;
};

function PlatformInsights({onStart}:{onStart:(role?:Role)=>void}){
  const [data,setData]=useState<PlatformOverviewData|null>(null);
  useEffect(()=>{
    let active=true;
    fetch("/api/platform-overview")
      .then(response=>response.ok?response.json():null)
      .then(next=>{if(active&&next)setData(next as PlatformOverviewData);})
      .catch(()=>undefined);
    return()=>{active=false;};
  },[]);
  const metrics=[
    ["ACTIVE IDEAS",data?.metrics.validations??0,"Founder studies in the validation loop"],
    ["VERIFIED FEEDBACK",data?.metrics.responses??0,"Stored, quality-scored contributor responses"],
    ["NETWORK MEMBERS",data?.metrics.users??0,"Profiles across all three roles"],
    ["ONLINE NOW",data?.metrics.online??0,"Active within the last 120 seconds"],
  ];
  const roleTotalRaw=(data?.roles.founder??0)+(data?.roles.contributor??0)+(data?.roles.investor??0);
  const roleTotal=Math.max(1,roleTotalRaw);
  const rolePercent=(value:number)=>Math.round(value/roleTotal*100);
  const activity=data?.activity?.length?data.activity:Array.from({length:7},(_,index)=>({day:`0${index+1}`,count:0}));
  const maxActivity=Math.max(1,...activity.map(item=>item.count));
  return <section className="platform-insights-page">
    <div className="platform-insights-hero">
      <div><span>GENERAL · PLATFORM INSIGHTS</span><h1>Three perspectives.<br/><em>One readable pulse.</em></h1><p>This public overview summarizes activity at network level. It is designed for discovery and transparency—never for exposing a person’s private response.</p><div className="platform-hero-actions"><button className="primary" onClick={()=>onStart()}>Join the network →</button><small><i/> {data?"LIVE DATABASE SNAPSHOT":"CONNECTING TO PLATFORM DATA"}</small></div></div>
      <div className="platform-orbit" aria-label="Founder, contributor, and investor data orbit">
        <div className="platform-orbit-ring ring-a"/><div className="platform-orbit-ring ring-b"/>
        <div className="platform-orbit-core"><span>INSIGHT</span><b>{Math.round(data?.metrics.averageQuality??0)}</b><small>AVG QUALITY</small></div>
        <div className="platform-orbit-role por-founder"><i/>FOUNDER</div>
        <div className="platform-orbit-role por-contributor"><i/>CONTRIBUTOR</div>
        <div className="platform-orbit-role por-investor"><i/>INVESTOR</div>
        {Array.from({length:6},(_,index)=><i className={`orbit-signal os-${index+1}`} key={index}/>)}
      </div>
    </div>
    <div className="platform-live-metrics">{metrics.map((metric,index)=><article key={metric[0]}><span>0{index+1}</span><div className={`metric-symbol ms-${index+1}`}><i/><i/><i/><i/></div><b>{metric[1].toLocaleString()}</b><strong>{metric[0]}</strong><small>{metric[2]}</small></article>)}</div>
    <div className="platform-visual-grid">
      <article className="network-composition">
        <div className="platform-card-title"><span>ROLE COMPOSITION</span><b>LIVE PROFILE MIX</b></div>
        <div className="composition-body">
          <div className="composition-donut" style={{background:roleTotalRaw?`conic-gradient(#d5744f 0 ${rolePercent(data?.roles.founder??0)}%,#758c78 ${rolePercent(data?.roles.founder??0)}% ${rolePercent((data?.roles.founder??0)+(data?.roles.contributor??0))}%,#b69a79 ${rolePercent((data?.roles.founder??0)+(data?.roles.contributor??0))}% 100%)`:"conic-gradient(#d9cec1 0 100%)"}}><div><b>{data?.metrics.users??0}</b><span>members</span></div></div>
          <div className="composition-legend">{[
            ["Founder",data?.roles.founder??0,"#d5744f"],
            ["Contributor",data?.roles.contributor??0,"#758c78"],
            ["Investor",data?.roles.investor??0,"#b69a79"],
          ].map(item=><div key={item[0]}><i style={{background:String(item[2])}}/><span>{item[0]}</span><b>{Number(item[1]).toLocaleString()}</b></div>)}</div>
        </div>
      </article>
      <article className="platform-activity-card">
        <div className="platform-card-title"><span>7-DAY NETWORK ACTIVITY</span><b>PROFILES + IDEAS + FEEDBACK</b></div>
        <div className="platform-activity-chart">{activity.map((item,index)=><div key={`${item.day}-${index}`}><b>{item.count}</b><i style={{height:item.count?`${Math.max(10,item.count/maxActivity*100)}%`:"2px",animationDelay:`${index*.08}s`}}/><span>{item.day.length>=10?new Date(`${item.day}T12:00:00Z`).toLocaleDateString(undefined,{weekday:"short"}):item.day}</span></div>)}</div>
      </article>
    </div>
    <div className="platform-role-summary">
      <article><span>FOUNDER SIGNAL</span><div className="summary-glyph founder-summary"><i/><i/><i/></div><h2>{data?.metrics.validations??0}</h2><p>ideas framed as measurable decisions</p><button onClick={()=>onStart("founder")}>Enter Founder →</button></article>
      <article><span>CONTRIBUTOR VALUE</span><div className="summary-glyph contributor-summary"><i/><i/><i/><i/></div><h2>{data?.metrics.responses??0}</h2><p>responses scored for quality and integrity</p><button onClick={()=>onStart("contributor")}>Enter Contributor →</button></article>
      <article><span>INVESTOR DISCOVERY</span><div className="summary-glyph investor-summary"><i/><i/><i/></div><h2>{Math.round(data?.metrics.averageQuality??0)}<small>/100</small></h2><p>average evidence quality across the network</p><button onClick={()=>onStart("investor")}>Enter Investor →</button></article>
    </div>
    <div className="methodology-ribbon"><span>PUBLIC DATA STANDARD</span><p>Only aggregate counts and quality summaries appear here. Individual comments, contact details, and private studies stay inside their authorized workspaces.</p><i>{data?.asOf?`Updated ${new Date(data.asOf).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}`:"Awaiting live data"}</i></div>
  </section>;
}

function SignalSculpture({ role }:{role:Role}) {
  return <div className="signal-sculpture" aria-label="Live validation signal">
    <div className="signal-halo h1"/><div className="signal-halo h2"/>
    <div className="signal-label top"><span>SAMPLE STUDY</span><b>284 RESPONSE DATASET</b></div>
    <article className="signal-main">
      <span>{role === "founder" ? "VALIDATION PREVIEW" : role === "contributor" ? "MATCH PREVIEW" : "SIGNAL PREVIEW"}</span>
      <h3>Would a contribution-first talent network change how early teams hire?</h3>
      <div className="signal-meter"><i style={{width:"81%"}}/><b>81</b></div>
      <div className="signal-meta"><span>Problem resonance <b>High</b></span><span>Confidence <b>94%</b></span></div>
    </article>
    <article className="signal-float f-one"><span>TOP THEME</span><b>Show me proof of skill</b><small>68% of qualified responses</small></article>
    <article className="signal-float f-two"><span>MODEL PREVIEW</span><b>+12 quality-response scenario</b></article>
  </div>
}

const globeRegions = [
  { id: "global", label: "Global", focus: [20, 12] as [number, number] },
  { id: "north-america", label: "North America", focus: [-105, 38] as [number, number] },
  { id: "europe", label: "Europe", focus: [10, 50] as [number, number] },
  { id: "asia", label: "Asia", focus: [103, 30] as [number, number] },
  { id: "africa", label: "Africa", focus: [20, 2] as [number, number] },
  { id: "oceania", label: "Oceania", focus: [137, -27] as [number, number] },
];

const globePartners = [
  { city: "San Francisco", name: "Berkeley founder ecosystem", region: "north-america", coordinates: [-122.42, 37.77] as [number, number] },
  { city: "New York", name: "Founder research community", region: "north-america", coordinates: [-74.0, 40.71] as [number, number] },
  { city: "London", name: "University innovation lab", region: "europe", coordinates: [-0.13, 51.51] as [number, number] },
  { city: "Berlin", name: "Climate technology network", region: "europe", coordinates: [13.4, 52.52] as [number, number] },
  { city: "Singapore", name: "Asia founder circle", region: "asia", coordinates: [103.82, 1.35] as [number, number] },
  { city: "Beijing", name: "Research contributor community", region: "asia", coordinates: [116.41, 39.9] as [number, number] },
  { city: "Bangalore", name: "Builder network", region: "asia", coordinates: [77.59, 12.97] as [number, number] },
  { city: "Nairobi", name: "Emerging market research node", region: "africa", coordinates: [36.82, -1.29] as [number, number] },
  { city: "Sydney", name: "Accelerator community", region: "oceania", coordinates: [151.21, -33.87] as [number, number] },
];

function EcosystemGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const markerPositions = useRef<Array<{ x:number; y:number; index:number; visible:boolean }>>([]);
  const selectedRef = useRef("global");
  const hoveredRef = useRef<number|null>(null);
  const [selected, setSelected] = useState("global");
  const [hovered, setHovered] = useState<number | null>(null);
  const activeRegion = globeRegions.find(r => r.id === selected) ?? globeRegions[0];
  const activePartners = selected === "global" ? globePartners : globePartners.filter(p => p.region === selected);

  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { hoveredRef.current = hovered; }, [hovered]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const topology = worldData as unknown as Topology<{ countries: GeometryCollection }>;
    const land = feature(topology, topology.objects.countries);
    const projection = geoOrthographic().clipAngle(90).precision(.35);
    const graticule = geoGraticule10();
    let rotation = -18;
    let tilt = -10;
    let scale = 190;
    let previous = performance.now();
    let animationFrame = 0;

    const draw = (time:number) => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(rect.width * ratio) || canvas.height !== Math.round(rect.height * ratio)) {
        canvas.width = Math.round(rect.width * ratio);
        canvas.height = Math.round(rect.height * ratio);
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, rect.width, rect.height);

      const delta = Math.min(time - previous, 40);
      previous = time;
      const region = globeRegions.find(r => r.id === selectedRef.current) ?? globeRegions[0];
      const targetScale = Math.min(rect.width, rect.height) * (selectedRef.current === "global" ? .41 : .53);
      if (selectedRef.current === "global") {
        if (hoveredRef.current === null) rotation += delta * .0042;
        tilt += (-10 - tilt) * .06;
      } else {
        const targetRotation = -region.focus[0];
        const difference = ((targetRotation - rotation + 540) % 360) - 180;
        rotation += difference * .075;
        tilt += (-region.focus[1] - tilt) * .075;
      }
      scale += (targetScale - scale) * .075;
      projection.translate([rect.width / 2, rect.height / 2]).scale(scale).rotate([rotation, tilt]);
      const path = geoPath(projection, context);

      const atmosphere = context.createRadialGradient(rect.width*.42, rect.height*.36, 8, rect.width/2, rect.height/2, scale*1.15);
      atmosphere.addColorStop(0, "rgba(119,166,133,.28)");
      atmosphere.addColorStop(.58, "rgba(53,86,65,.16)");
      atmosphere.addColorStop(1, "rgba(221,121,77,0)");
      context.beginPath();
      context.arc(rect.width/2, rect.height/2, scale*1.13, 0, Math.PI*2);
      context.fillStyle = atmosphere;
      context.fill();

      context.beginPath();
      path({ type: "Sphere" });
      const ocean = context.createRadialGradient(rect.width*.39, rect.height*.3, scale*.05, rect.width*.54, rect.height*.57, scale);
      ocean.addColorStop(0, "#496c57");
      ocean.addColorStop(.52, "#294638");
      ocean.addColorStop(1, "#152c24");
      context.fillStyle = ocean;
      context.fill();
      context.strokeStyle = "rgba(226,196,169,.42)";
      context.lineWidth = 1.2;
      context.stroke();

      context.beginPath();
      path(graticule);
      context.strokeStyle = "rgba(229,214,197,.10)";
      context.lineWidth = .65;
      context.stroke();

      context.beginPath();
      path(land);
      context.fillStyle = selectedRef.current === "global" ? "#87977e" : "#9daa90";
      context.fill();
      context.strokeStyle = "rgba(26,48,37,.62)";
      context.lineWidth = .55;
      context.stroke();

      const center:[number,number] = [-rotation, -tilt];
      markerPositions.current = globePartners.map((partner, index) => {
        const point = projection(partner.coordinates);
        const visible = Boolean(point) && geoDistance(partner.coordinates, center) < Math.PI / 2;
        const matches = selectedRef.current === "global" || selectedRef.current === partner.region;
        if (point && visible && matches) {
          const [x,y] = point;
          const pulse = 5 + Math.sin(time/420 + index) * 1.8;
          context.beginPath();
          context.arc(x, y, pulse * 2.5, 0, Math.PI*2);
          const glow = context.createRadialGradient(x,y,1,x,y,pulse*2.5);
          glow.addColorStop(0,"rgba(255,221,180,.88)");
          glow.addColorStop(.28,"rgba(226,116,73,.62)");
          glow.addColorStop(1,"rgba(226,116,73,0)");
          context.fillStyle = glow;
          context.fill();
          context.beginPath();
          context.arc(x, y, hoveredRef.current === index ? 5.4 : 3.5, 0, Math.PI*2);
          context.fillStyle = hoveredRef.current === index ? "#fff0d6" : "#e8794d";
          context.fill();
          if (hoveredRef.current === index) {
            context.beginPath();
            context.moveTo(x+7,y);
            context.lineTo(x+24,y-14);
            context.strokeStyle = "rgba(255,234,209,.72)";
            context.stroke();
            context.font = "700 10px Arial";
            context.fillStyle = "#fff4e6";
            context.fillText(partner.city, x+28, y-13);
          }
          return {x,y,index,visible:true};
        }
        return {x:point?.[0] ?? 0,y:point?.[1] ?? 0,index,visible:false};
      });

      const shade = context.createLinearGradient(rect.width*.25,0,rect.width*.78,rect.height);
      shade.addColorStop(0,"rgba(255,238,210,.13)");
      shade.addColorStop(.48,"rgba(255,255,255,0)");
      shade.addColorStop(1,"rgba(7,24,18,.48)");
      context.beginPath();
      context.arc(rect.width/2,rect.height/2,scale,0,Math.PI*2);
      context.fillStyle=shade;
      context.fill();
      animationFrame = requestAnimationFrame(draw);
    };
    animationFrame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  const locateMarker = (event:React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const nearest = markerPositions.current
      .filter(p => p.visible)
      .map(p => ({...p, distance:Math.hypot(p.x-x,p.y-y)}))
      .sort((a,b)=>a.distance-b.distance)[0];
    setHovered(nearest && nearest.distance < 18 ? nearest.index : null);
  };

  const openHovered = () => {
    if (hovered === null) return;
    setSelected(globePartners[hovered].region);
  };

  return <section className="ecosystem globe-ecosystem">
    <div className="ecosystem-copy"><span>CONNECTED ECOSYSTEM</span><h2>A living network,<br/><em>not a static map.</em></h2><p>Move across the illuminated globe, click a region, and inspect the founder, university, and research communities represented by each signal node.</p>
      <div className="region-controls">{globeRegions.map(region=><button className={selected===region.id?"active":""} key={region.id} onClick={()=>setSelected(region.id)}><i/>{region.label}</button>)}</div>
    </div>
    <div className="globe-stage">
      <div className="globe-aura"/><div className="orbit-line orbit-a"/><div className="orbit-line orbit-b"/>
      <canvas ref={canvasRef} className={hovered === null ? "" : "has-hover"} aria-label="Interactive 3D globe of InsightLab ecosystem nodes" onPointerMove={locateMarker} onPointerLeave={()=>setHovered(null)} onClick={openHovered}/>
      <div className="globe-hud top"><span>● NETWORK LIVE</span><b>Drag-free auto rotation</b></div>
      <div className="globe-region-card">
        <span>{activeRegion.label.toUpperCase()}</span>
        <div className="partner-constellation">{activePartners.map((partner,index)=><button key={partner.city} onMouseEnter={()=>setHovered(globePartners.indexOf(partner))} onMouseLeave={()=>setHovered(null)} onClick={()=>setSelected(partner.region)}><i style={{animationDelay:`${index*.18}s`}}/><span><b>{partner.city}</b><small>{partner.name}</small></span></button>)}</div>
      </div>
      <div className="globe-hud bottom"><span>{globePartners.length} SIGNAL NODES</span><b>Click a light to focus its region</b></div>
    </div>
  </section>
}

function FounderWorkspace({notify,setView,apiFetch,isDemo,onSignIn}:{notify:(s:string)=>void;setView:(v:View)=>void;apiFetch:ApiFetch;isDemo:boolean;onSignIn:()=>void}) {
  const [studyType,setStudyType]=useState<"idea"|"survey">("survey");
  const [idea,setIdea]=useState("");
  const [need,setNeed]=useState("");
  const [audience,setAudience]=useState("Early-career professionals");
  const [visibility,setVisibility]=useState("targeted");
  const [repositoryUrl,setRepositoryUrl]=useState("");
  const [targetResponses,setTargetResponses]=useState(150);
  const [requestedData,setRequestedData]=useState(["Problem resonance","Objections","Willingness to try"]);
  const [questions,setQuestions]=useState<SurveyQuestion[]>([
    {id:"q-1",prompt:"How strongly do you experience this problem today?",type:"scale",required:true,options:[]},
    {id:"q-2",prompt:"What do you use instead, and where does it fall short?",type:"text",required:true,options:[]},
  ]);
  const [attachment,setAttachment]=useState<{name:string;size:number;key:string}|null>(null);
  const [uploading,setUploading]=useState(false);
  const [draggingFile,setDraggingFile]=useState(false);
  const [saving,setSaving]=useState(false);
  const fileInputRef=useRef<HTMLInputElement>(null);
  const dataOptions=["Problem resonance","Willingness to try","Willingness to pay","Current alternative","Objections","Demographic split"];
  const estimatedReward=targetResponses*(studyType==="survey"?70:35);
  const toggleData=(item:string)=>setRequestedData(current=>current.includes(item)?current.filter(value=>value!==item):[...current,item]);
  const updateQuestion=(id:string,patch:Partial<SurveyQuestion>)=>setQuestions(current=>current.map(question=>question.id===id?{...question,...patch}:question));
  const addQuestion=()=>setQuestions(current=>[...current,{id:`q-${Date.now()}`,prompt:"",type:"single",required:false,options:["Option one","Option two"]}]);
  const removeQuestion=(id:string)=>setQuestions(current=>current.filter(question=>question.id!==id));
  const handleFile=async(file:File|null)=>{
    if(!file)return;
    const extension=file.name.split(".").pop()?.toLowerCase()??"";
    if(!["pdf","doc","docx","txt","png","jpg","jpeg","webp"].includes(extension))return notify("Use a PDF, DOCX, TXT, PNG, JPG, or WebP file.");
    if(file.size>10*1024*1024)return notify("Files must be 10 MB or smaller.");
    if(isDemo){setAttachment({name:file.name,size:file.size,key:"demo"});notify("Demo file is ready. It stays on this device until you sign in.");return;}
    setUploading(true);
    try{
      const form=new FormData();
      form.append("file",file);
      const response=await apiFetch("/api/study-files",{method:"POST",body:form});
      const data=await response.json() as {key?:string;fileName?:string;size?:number;error?:string};
      if(!response.ok||!data.key)notify(data.error??"We could not upload that file.");
      else{setAttachment({name:data.fileName??file.name,size:data.size??file.size,key:data.key});notify("Research file stored privately.");}
    }finally{setUploading(false);}
  };
  const dropFile=(event:React.DragEvent<HTMLDivElement>)=>{
    event.preventDefault();
    setDraggingFile(false);
    void handleFile(event.dataTransfer.files?.[0]??null);
  };
  const clearDemoFile=()=>{
    setAttachment(null);
    if(fileInputRef.current)fileInputRef.current.value="";
    notify("Demo file removed.");
  };
  const saveIdea=async()=>{
    if(idea.trim().length<10||need.trim().length<20)return notify("Add a clearer idea and decision question first.");
    if(!requestedData.length)return notify("Choose at least one result you want the study to produce.");
    if(studyType==="survey"&&(questions.length===0||questions.some(question=>question.prompt.trim().length<8)))return notify("Finish each survey question before saving.");
    if(isDemo){notify("Demo draft is ready. Sign in to save, publish, and collect live responses.");return;}
    setSaving(true);
    try{
      const response=await apiFetch("/api/validations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
        title:idea,description:need,category:"Founder submission",stage:"problem-discovery",targetResponses,
        rewardPoints:studyType==="survey"?70:35,visibility,studyType,requestedData,
        surveyQuestions:studyType==="survey"?questions:[],attachmentKey:attachment?.key==="demo"?"":attachment?.key??"",
        repositoryUrl,
      })});
      notify(response.ok?"Validation draft saved with its research design.":"We could not save this draft yet.");
    }finally{setSaving(false);}
  };
  return <section className="workspace-page role-workspace founder-studio">
    <DemoModeBar visible={isDemo} role="Founder" onSignIn={onSignIn}/>
    <div className="workspace-heading"><div><span>FOUNDER VALIDATION STUDIO</span><h1>Design the evidence<br/><em>before collecting it.</em></h1></div><button className="outline-btn" onClick={()=>setView("analytics")}>Open full analysis ↗</button></div>
    <div className="founder-studio-layout">
      <article className="founder-builder">
        <div className="builder-progress"><span className="done"><b>01</b>Frame</span><i/><span className={idea.length>9?"done":""}><b>02</b>Design</span><i/><span><b>03</b>Preview</span></div>
        <div className="study-type-switch"><button className={studyType==="idea"?"active":""} onClick={()=>setStudyType("idea")}><i>◇</i><span><b>Idea only</b><small>Rating + open feedback</small></span></button><button className={studyType==="survey"?"active":""} onClick={()=>setStudyType("survey")}><i>▦</i><span><b>Guided survey</b><small>Custom questions + analysis</small></span></button></div>
        <label>Idea or working title<input value={idea} onChange={event=>setIdea(event.target.value)} placeholder="e.g. A contribution-first hiring network" maxLength={120}/><small>{idea.length}/120</small></label>
        <label>What decision should this evidence support?<textarea value={need} onChange={event=>setNeed(event.target.value)} placeholder="Explain the assumption, decision, and evidence that would change your direction."/><small>{need.length} characters</small></label>
        <div className="compose-row"><label>Who should respond?<select value={audience} onChange={event=>setAudience(event.target.value)}><option>Early-career professionals</option><option>Startup founders</option><option>Healthcare workers</option><option>Broad discovery audience</option></select></label><label>Study visibility<select value={visibility} onChange={event=>setVisibility(event.target.value)}><option value="public">Public discovery</option><option value="targeted">Targeted audience</option><option value="private">Private link</option></select></label></div>
        <div className="github-project-link"><span>⌘</span><label>GitHub repository<input type="url" value={repositoryUrl} onChange={event=>setRepositoryUrl(event.target.value)} placeholder="https://github.com/your-name/your-project"/></label><a href={repositoryUrl||"https://github.com"} target="_blank" rel="noreferrer">{repositoryUrl?"Open repository ↗":"Connect a project ↗"}</a></div>
        <fieldset className="data-design"><legend>Choose the results you want</legend><p>The analysis will organize contributor evidence around these decision signals.</p><div>{dataOptions.map(item=><button key={item} className={requestedData.includes(item)?"active":""} onClick={()=>toggleData(item)}><i>{requestedData.includes(item)?"✓":"+"}</i>{item}</button>)}</div></fieldset>
        <div className={`file-drop enhanced-file-drop${draggingFile?" dragging":""}${attachment?" has-file":""}`} onDragEnter={event=>{event.preventDefault();setDraggingFile(true);}} onDragOver={event=>event.preventDefault()} onDragLeave={()=>setDraggingFile(false)} onDrop={dropFile}>
          <input ref={fileInputRef} id="founder-context-file" type="file" accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.webp" onChange={event=>void handleFile(event.target.files?.[0]??null)}/>
          <label htmlFor="founder-context-file"><i>{attachment?"✓":"↥"}</i><span><em>{uploading?"UPLOADING…":attachment?"ATTACHMENT READY":"PROJECT FILE"}</em><b>{attachment?attachment.name:"Upload a file from your GitHub project or device"}</b><small>{attachment?`${(attachment.size/1024/1024).toFixed(2)} MB · ${isDemo?"demo file stays on this device":"private founder material"}`:"PDF, DOCX, TXT or image · 10 MB max"}</small></span></label>
          {attachment&&isDemo&&<button type="button" onClick={clearDemoFile}>Remove demo file</button>}
        </div>
        {studyType==="survey"&&<section className="question-builder"><div><span>PERSONALIZED QUESTIONNAIRE</span><button onClick={addQuestion}>＋ Add question</button></div>{questions.map((question,index)=><article key={question.id}>
          <header><b>{String(index+1).padStart(2,"0")}</b><select value={question.type} onChange={event=>updateQuestion(question.id,{type:event.target.value as SurveyQuestion["type"],options:["single","multiple"].includes(event.target.value)&&!question.options.length?["Option one","Option two"]:question.options})}><option value="scale">1–5 scale</option><option value="single">Single choice</option><option value="multiple">Multiple choice</option><option value="text">Open text</option></select><label><input type="checkbox" checked={question.required} onChange={event=>updateQuestion(question.id,{required:event.target.checked})}/>Required</label><button aria-label="Remove question" onClick={()=>removeQuestion(question.id)}>×</button></header>
          <input value={question.prompt} onChange={event=>updateQuestion(question.id,{prompt:event.target.value})} placeholder="Write a neutral, decision-useful question"/>
          {["single","multiple"].includes(question.type)&&<textarea value={question.options.join("\n")} onChange={event=>updateQuestion(question.id,{options:event.target.value.split("\n").slice(0,8)})} placeholder={"One option per line\nSecond option"}/>}
        </article>)}</section>}
        <div className="collection-plan"><label>Target responses <input type="range" min="50" max="500" step="25" value={targetResponses} onChange={event=>setTargetResponses(Number(event.target.value))}/><b>{targetResponses}</b></label><p><span>Estimated reward pool</span><b>{estimatedReward.toLocaleString()} pts</b><small>Final points are weighted by contribution quality and integrity.</small></p></div>
        <div className="ai-frame"><span>✦</span><p><b>Research design check</b> Your current mix captures behavior, objections, and adoption intent. Avoid asking contributors to predict the whole market.</p><button onClick={()=>setRequestedData(["Problem resonance","Current alternative","Objections","Willingness to try"])}>Apply</button></div>
        <button className="primary builder-submit" disabled={saving||uploading} onClick={saveIdea}>{saving?"Saving…":isDemo?"Preview demo draft →":"Create validation draft →"}</button>
      </article>
      <aside className="founder-preview-rail">
        <article className="study-preview"><div><span>CONTRIBUTOR PREVIEW</span><b>{studyType==="survey"?"GUIDED SURVEY":"IDEA REVIEW"}</b></div><em>{idea||"Your working idea appears here"}</em><h3>{need||"The decision question contributors will see appears here."}</h3><div className="preview-data">{requestedData.slice(0,4).map(item=><span key={item}>{item}</span>)}</div>{studyType==="survey"&&questions.slice(0,3).map((question,index)=><p key={question.id}><b>0{index+1}</b>{question.prompt||"Untitled survey question"}<i>{question.type}</i></p>)}<button disabled>Submit thoughtful response</button></article>
        <article className="launch-readiness"><span>LAUNCH READINESS</span>{[["Decision framing",Math.min(100,need.length*2.2)],["Audience definition",audience?88:20],["Data design",requestedData.length*18],["Question quality",studyType==="idea"?100:questions.length?questions.filter(question=>question.prompt.length>12).length/questions.length*100:0]].map(item=><div key={item[0]}><b>{item[0]}</b><i><em style={{width:`${Math.min(100,Number(item[1]))}%`}}/></i><span>{Math.round(Math.min(100,Number(item[1])))}%</span></div>)}</article>
        <div className="aside-title"><span>PUBLISHED IDEAS</span><b>2 live</b></div>
        <LiveIdea title="Proofwork hiring signal" responses={156} score={81} change="+24 today"/>
        <LiveIdea title="Private founder feedback rooms" responses={89} score={74} change="+11 today"/>
        <button className="model-link" onClick={()=>setView("analytics")}>See contributor-level analysis →</button>
      </aside>
    </div>
  </section>;
}

function LiveIdea({title,responses,score,change}:{title:string;responses:number;score:number;change:string}) {
  return <article className="live-idea"><div><span>● COLLECTING</span><b>{change}</b></div><h3>{title}</h3><p><span><b>{responses}</b> responses</span><span><b>{score}</b> signal score</span></p><div className="tiny-chart">{[22,31,29,43,51,61,74,68,86].map((x,i)=><i key={i} style={{height:`${x}%`}} />)}</div></article>
}

const discoveryCopy={
  en:{loading:"Loading published validations…",loadingTag:"LIVE DATA",live:"LIVE PUBLISHED VALIDATIONS",fallback:"No published live validations yet. Showing clearly labeled demo examples.",fallbackTag:"DEMO FALLBACK",error:"Live validations could not be loaded. Check your connection or session, then retry.",errorTag:"LIVE DATA ERROR",retry:"Retry",founder:"Verified founder",founderName:"InsightLab founder"},
  zh:{loading:"正在加载已发布的真实验证项目…",loadingTag:"真实数据",live:"真实已发布验证项目",fallback:"目前还没有已发布的真实项目，以下为明确标注的演示示例。",fallbackTag:"演示数据",error:"无法加载真实验证项目。请检查网络或登录状态后重试。",errorTag:"真实数据错误",retry:"重试",founder:"已验证创业者",founderName:"InsightLab 创业者"},
  es:{loading:"Cargando validaciones publicadas…",loadingTag:"DATOS EN VIVO",live:"VALIDACIONES PUBLICADAS EN VIVO",fallback:"Todavía no hay validaciones publicadas. Se muestran ejemplos de demostración claramente etiquetados.",fallbackTag:"DATOS DE DEMOSTRACIÓN",error:"No se pudieron cargar las validaciones. Comprueba la conexión o la sesión e inténtalo de nuevo.",errorTag:"ERROR DE DATOS",retry:"Reintentar",founder:"Fundador verificado",founderName:"Fundador de InsightLab"},
} satisfies Record<Locale,Record<"loading"|"loadingTag"|"live"|"fallback"|"fallbackTag"|"error"|"errorTag"|"retry"|"founder"|"founderName",string>>;

function ContributorWorkspace({notify,apiFetch,isDemo,locale,reputation,onSignIn,onReputation}:{notify:(s:string)=>void;apiFetch:ApiFetch;isDemo:boolean;locale:Locale;reputation:number;onSignIn:()=>void;onReputation:(score:number)=>void}) {
  const [category,setCategory]=useState("All");
  const [search,setSearch]=useState("");
  const [active,setActive]=useState<Idea|null>(null);
  const [mode,setMode]=useState<ContributionType>("comment");
  const [rating,setRating]=useState(0);
  const [comment,setComment]=useState("");
  const [answers,setAnswers]=useState<Record<string,string|string[]>>({});
  const [submitting,setSubmitting]=useState(false);
  const [displayReputation,setDisplayReputation]=useState(reputation);
  const [catalog,setCatalog]=useState<Idea[]>(isDemo?ideas:[]);
  const [catalogMode,setCatalogMode]=useState<DiscoveryMode>(isDemo?"demo":"loading");
  const [retryKey,setRetryKey]=useState(0);
  const labels=discoveryCopy[locale];
  useEffect(()=>{
    if(isDemo)return;
    let activeRequest=true;
    apiFetch("/api/validations")
      .then(async response=>{
        if(discoveryModeForResponse(response.ok,0)==="error")throw new Error(`VALIDATIONS_${response.status}`);
        return response.json() as Promise<{validations?:ValidationRecord[]}>;
      })
      .then(data=>{
        if(!activeRequest)return;
        const published=(data?.validations??[]).filter(row=>row.status==="published").map(row=>validationToIdea(row,labels.founderName));
        const nextMode=discoveryModeForResponse(true,published.length);
        if(nextMode==="live"){setCatalog(published);setCatalogMode(nextMode);}
        else{setCatalog(ideas);setCatalogMode(nextMode);}
      })
      .catch(()=>{if(activeRequest){setCatalog([]);setCatalogMode("error");}});
    return()=>{activeRequest=false;};
  },[apiFetch,isDemo,labels.founderName,retryKey]);
  const retryCatalog=()=>{setCatalog([]);setCatalogMode("loading");setRetryKey(value=>value+1);};
  const categories=useMemo(()=>["All",...Array.from(new Set(catalog.map(idea=>idea.category)))],[catalog]);
  const filtered=useMemo(()=>catalog.filter(idea=>(category==="All"||idea.category===category)&&(idea.title+" "+idea.question+" "+idea.founder).toLowerCase().includes(search.toLowerCase())),[catalog,category,search]);
  const basePoints=mode==="rating"?12:mode==="comment"?35:70;
  const openIdea=(idea:Idea)=>{setActive(idea);setMode(idea.availableModes.includes("comment")?"comment":"rating");setRating(0);setComment("");setAnswers({});};
  const updateAnswer=(question:SurveyQuestion,value:string)=>{
    if(question.type!=="multiple"){setAnswers(current=>({...current,[question.id]:value}));return;}
    setAnswers(current=>{
      const values=Array.isArray(current[question.id])?current[question.id] as string[]:[];
      return {...current,[question.id]:values.includes(value)?values.filter(item=>item!==value):[...values,value]};
    });
  };
  const answerComplete=(question:SurveyQuestion)=>{
    const value=answers[question.id];
    return Array.isArray(value)?value.length>0:String(value??"").trim().length>0;
  };
  const submit=async()=>{
    if(!active||!rating)return notify("Choose a 1–5 rating before submitting.");
    if(mode==="comment"&&comment.trim().length<20)return notify("Add at least 20 characters so the model can assess your reasoning.");
    if(mode==="survey"&&active.surveyQuestions.some(question=>question.required&&!answerComplete(question)))return notify("Complete every required survey question.");
    if(isDemo){
      const next=Math.min(1000,Math.round(displayReputation+(mode==="rating"?1:mode==="comment"?3:5)));
      setDisplayReputation(next);
      notify(`Demo contribution complete · estimated +${basePoints} points · reputation ${next}`);
      setActive(null);
      return;
    }
    setSubmitting(true);
    try{
      const response=await apiFetch("/api/responses",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
        validationId:active.id,body:comment,rating,category:active.category,contributionType:mode,answers,
      })});
      const data=await response.json() as {rewardGranted?:number;reputation?:{current:number;change:number};error?:string};
      if(!response.ok)return notify(data.error??"We could not save that contribution.");
      if(data.reputation){
        setDisplayReputation(data.reputation.current);
        onReputation(data.reputation.current);
      }
      notify(`Verified contribution · +${data.rewardGranted??basePoints} points · reputation ${data.reputation?.change&&data.reputation.change>0?"+":""}${data.reputation?.change??0}`);
      setActive(null);setRating(0);setComment("");setAnswers({});
    }finally{setSubmitting(false);}
  };
  return <section className="workspace-page role-workspace contributor-page">
    <DemoModeBar visible={isDemo} role="Contributor" onSignIn={onSignIn}/>
    {!isDemo&&<div className={`live-data-status ${catalogMode}`}>
      <span>{catalogMode==="live"?labels.live:catalogMode==="loading"?labels.loadingTag:catalogMode==="error"?labels.errorTag:labels.fallbackTag}</span>
      <p>{catalogMode==="live"?`${catalog.length} ${labels.live.toLowerCase()}`:catalogMode==="loading"?labels.loading:catalogMode==="error"?labels.error:labels.fallback}</p>
      {catalogMode==="error"&&<button onClick={retryCatalog}>{labels.retry}</button>}
    </div>}
    <div className="workspace-heading"><div><span>CONTRIBUTOR DISCOVERY</span><h1>Choose the ideas<br/><em>you can sharpen.</em></h1></div><div className="search-box"><span>⌕</span><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search ideas, problems, or founders"/></div></div>
    <div className="effort-key"><span>CHOOSE YOUR EFFORT</span><div><i>◇</i><b>Quick rating</b><small>12 base pts</small></div><div><i>✎</i><b>Reasoned comment</b><small>35 base pts</small></div><div><i>▦</i><b>Full survey</b><small>70 base pts</small></div><p>Final rewards are adjusted by specificity, integrity, and your continuously updated reputation.</p></div>
    <div className="interest-row">{categories.map(item=><button key={item} className={category===item?"active":""} onClick={()=>setCategory(item)}>{item}</button>)}</div>
    <div className="contributor-layout"><div className="idea-feed">{filtered.length?filtered.map(idea=><article className="feed-card" key={idea.id}><div className="feed-top"><span style={{background:idea.color}}>{idea.category}</span><b>up to {idea.reward} pts</b></div><h2>{idea.title}</h2><p>{idea.question}</p><div className="task-mode-dots">{idea.availableModes.map(item=><span key={item}><i/>{item==="rating"?"Rating":item==="comment"?"Comment":"Survey"}</span>)}</div><div className="feed-stats"><span><b>{idea.score}</b> signal</span><span><b>{idea.responses}</b> responses</span><span><b>{idea.trend}</b> this week</span></div><div className="feed-founder"><span>{idea.founder[0]}</span><p><b>{idea.founder}</b><small>{labels.founder}</small></p><button onClick={()=>openIdea(idea)}>Choose response →</button></div></article>):<div className="feed-empty"><i/><h3>No exact matches.</h3><p>Try another category or a shorter search phrase.</p><button onClick={()=>{setSearch("");setCategory("All");}}>Reset discovery</button></div>}</div>
      <aside className="contributor-score"><span>LIVE REPUTATION</span><div className="score-wheel" style={{background:`conic-gradient(#d8734e 0 ${displayReputation/10}%,rgba(255,255,255,.09) ${displayReputation/10}% 100%)`}}><div>{Math.round(displayReputation)}<small>/1000</small></div></div><h3>{displayReputation>=800?"Expert signal":displayReputation>=650?"Trusted specialist":"Building trust"}</h3><p>Your score recalculates after every response using quality, duplicate risk, and historical consistency.</p><div><b>Specificity</b><i><em style={{width:"88%"}}/></i><span>88</span></div><div><b>Constructiveness</b><i><em style={{width:"92%"}}/></i><span>92</span></div><button onClick={()=>notify("Interest settings are available from your profile.")}>Edit interests</button></aside>
    </div>
    {active&&<div className="modal-backdrop"><div className="response-modal response-studio"><button className="modal-close" onClick={()=>setActive(null)}>×</button><span>{active.category} · VERIFIED CONTRIBUTION</span><h2>{active.question}</h2>
      <div className="response-mode-switch">{active.availableModes.map(item=><button key={item} className={mode===item?"active":""} onClick={()=>setMode(item)}><i>{item==="rating"?"◇":item==="comment"?"✎":"▦"}</i><b>{item==="rating"?"Quick rating":item==="comment"?"Rate + explain":"Full survey"}</b><small>{item==="rating"?"~30 sec · 12 base pts":item==="comment"?"~3 min · 35 base pts":"~6 min · 70 base pts"}</small></button>)}</div>
      <label>Your rating<div className="stars">{[1,2,3,4,5].map(number=><button className={rating>=number?"on":""} key={number} onClick={()=>setRating(number)}>★</button>)}</div></label>
      {mode==="comment"&&<label>Explain your reasoning<textarea value={comment} onChange={event=>setComment(event.target.value)} placeholder="What would make this useful—or fail? Specific examples receive more weight."/></label>}
      {mode==="survey"&&<div className="contributor-survey">{active.surveyQuestions.map((question,index)=><article key={question.id}><span>0{index+1} {question.required&&"· REQUIRED"}</span><h3>{question.prompt}</h3>
        {question.type==="scale"&&<div className="survey-scale">{[1,2,3,4,5].map(number=><button className={answers[question.id]===String(number)?"active":""} key={number} onClick={()=>updateAnswer(question,String(number))}>{number}</button>)}</div>}
        {["single","multiple"].includes(question.type)&&<div className="survey-options">{question.options.map(option=>{const selected=Array.isArray(answers[question.id])?(answers[question.id] as string[]).includes(option):answers[question.id]===option;return <button className={selected?"active":""} key={option} onClick={()=>updateAnswer(question,option)}><i>{selected?"✓":"○"}</i>{option}</button>;})}</div>}
        {question.type==="text"&&<textarea value={String(answers[question.id]??"")} onChange={event=>updateAnswer(question,event.target.value)} placeholder="Share a concrete example or tradeoff."/>}
      </article>)}</div>}
      <div className="quality-preview"><span>✦ LIVE VALUE PREVIEW</span><p>{mode==="rating"?"Fast signal · reputation changes only slightly.":mode==="survey"?`${Object.keys(answers).length}/${active.surveyQuestions.length} questions answered · highest base reward.`:comment.length<20?"Add a concrete reason to unlock comment-level points.":comment.length<80?"Good start · add an example or tradeoff for a stronger weight.":"High specificity detected · estimated model weight 1.2×"}</p><b>{basePoints} base pts</b></div>
      <button className="primary full" disabled={submitting} onClick={submit}>{submitting?"Analyzing integrity…":isDemo?"Complete demo response →":"Analyze & submit response →"}</button>
    </div></div>}
  </section>;
}

type ContributorInsightData={
  summary:{contributions:number;pointsEarned:number;averageQuality:number;averageWeight:number;approved:number;pending:number};
  items:Array<{id:number;ideaTitle:string;ideaCategory:string;body:string;rating:number;quality:number;weight:number;points:number;createdAt:string;status:"approved"|"review";contributionType?:string}>;
  activity:Array<{label:string;points:number;contributions:number}>;
};

const contributorDemo:ContributorInsightData={
  summary:{contributions:12,pointsEarned:640,averageQuality:88,averageWeight:1.16,approved:10,pending:2},
  items:[
    {id:1,ideaTitle:"PulseNest",ideaCategory:"Digital Health",body:"Recovery confidence depends on seeing a stable baseline, not another isolated health score.",rating:4,quality:94,weight:1.28,points:64,createdAt:"2026-07-21T12:00:00Z",status:"approved",contributionType:"survey"},
    {id:2,ideaTitle:"Proofwork",ideaCategory:"Future of Work",body:"A contribution signal is useful only if employers can compare context, difficulty, and collaboration—not volume alone.",rating:5,quality:91,weight:1.23,points:62,createdAt:"2026-07-18T12:00:00Z",status:"approved",contributionType:"comment"},
    {id:3,ideaTitle:"Loop",ideaCategory:"Climate",body:"Pickup density is the real adoption constraint; a weekly neighborhood route may work better than on-demand collection.",rating:3,quality:82,weight:1.08,points:54,createdAt:"2026-07-15T12:00:00Z",status:"review",contributionType:"comment"},
  ],
  activity:[
    {label:"W1",points:72,contributions:1},{label:"W2",points:118,contributions:2},{label:"W3",points:86,contributions:2},
    {label:"W4",points:140,contributions:3},{label:"W5",points:96,contributions:2},{label:"W6",points:128,contributions:2},
  ],
};

function ContributorInsights({apiFetch,onExplore}:{apiFetch:ApiFetch;onExplore:()=>void}){
  const [data,setData]=useState<ContributorInsightData|null>(null);
  const [mode,setMode]=useState<"loading"|"live"|"demo">("loading");
  useEffect(()=>{
    let active=true;
    apiFetch("/api/responses")
      .then(async response=>{
        if(!active)return;
        if(response.ok){
          setData(await response.json() as ContributorInsightData);
          setMode("live");
        }else{
          setData(contributorDemo);
          setMode("demo");
        }
      })
      .catch(()=>{if(active){setData(contributorDemo);setMode("demo");}});
    return()=>{active=false;};
  },[apiFetch]);
  const current=data??{summary:{contributions:0,pointsEarned:0,averageQuality:0,averageWeight:0,approved:0,pending:0},items:[],activity:[]};
  const maxPoints=Math.max(1,...current.activity.map(item=>item.points));
  const approvedShare=current.summary.contributions?Math.round(current.summary.approved/current.summary.contributions*100):0;
  return <section className="contributor-insights-page">
    <div className="contributor-insights-hero">
      <div><span>CONTRIBUTOR · PERSONAL INSIGHTS</span><h1>Your comments created<br/><em>measurable value.</em></h1><p>Review every idea you helped sharpen, how the integrity model weighted your reasoning, and the points each contribution earned.</p></div>
      <div className="contributor-balance"><span>AVAILABLE VALUE</span><h2>{current.summary.pointsEarned.toLocaleString()}<small> pts</small></h2><div><i style={{width:`${Math.min(100,current.summary.pointsEarned%1000/10)}%`}}/></div><p>{current.summary.pending} contribution{current.summary.pending===1?"":"s"} still under review</p></div>
    </div>
    {mode==="demo"&&<div className="insight-mode-note"><span>DEMO PROFILE</span><p>Sign in to replace this sample with your own verified contribution and reward history.</p></div>}
    <div className="contributor-metric-row">
      {[["IDEAS REVIEWED",current.summary.contributions,"comment"],["POINTS EARNED",current.summary.pointsEarned,"points"],["AVG QUALITY",Math.round(current.summary.averageQuality),"quality"],["MODEL WEIGHT",`${current.summary.averageWeight.toFixed(2)}×`,"weight"]].map((item,index)=><article key={item[0]}><span>0{index+1}</span><div className={`contributor-metric-icon ${item[2]}`}><i/><i/><i/><i/></div><b>{typeof item[1]==="number"?item[1].toLocaleString():item[1]}</b><small>{item[0]}</small></article>)}
    </div>
    <div className="contributor-insight-grid">
      <article className="earnings-chart-card">
        <div className="platform-card-title"><span>POINTS OVER TIME</span><b>{current.summary.pointsEarned.toLocaleString()} TOTAL</b></div>
        {current.activity.length?<div className="earnings-chart">{current.activity.map((item,index)=><div key={`${item.label}-${index}`}><b>{item.points}</b><i style={{height:`${Math.max(8,item.points/maxPoints*100)}%`,animationDelay:`${index*.08}s`}}><em>{item.contributions}</em></i><span>{item.label}</span></div>)}</div>:<div className="empty-insight-visual"><i/><i/><i/><span>Your points graph will grow here.</span></div>}
      </article>
      <article className="reward-status-card">
        <div className="platform-card-title"><span>REVIEW STATUS</span><b>MODEL VERIFIED</b></div>
        <div className="approval-orbit" style={{background:`conic-gradient(#d87550 0 ${approvedShare}%,rgba(255,255,255,.1) ${approvedShare}% 100%)`}}><div><b>{approvedShare}%</b><span>approved</span></div></div>
        <div className="approval-legend"><span><i/>Approved <b>{current.summary.approved}</b></span><span><i/>In review <b>{current.summary.pending}</b></span></div>
      </article>
    </div>
    <article className="contribution-history">
      <div className="contribution-history-head"><div><span>YOUR IDEA HISTORY</span><h2>Where your perspective landed.</h2></div><button onClick={onExplore}>Review another idea →</button></div>
      {current.items.length?<div className="contribution-list">{current.items.map(item=><article key={item.id}>
        <div className="contribution-date"><b>{new Date(item.createdAt).toLocaleDateString(undefined,{month:"short",day:"numeric"})}</b><span>{new Date(item.createdAt).getFullYear()}</span></div>
        <div className="contribution-idea"><span>{item.ideaCategory} · {item.contributionType==="survey"?"FULL SURVEY":item.contributionType==="rating"?"QUICK RATING":"REASONED COMMENT"}</span><h3>{item.ideaTitle}</h3><p>{item.body?`“${item.body}”`:item.contributionType==="survey"?"Structured survey answers submitted.":"Rating-only signal submitted."}</p></div>
        <div className="contribution-rating"><span>YOUR RATING</span><b>{Array.from({length:5},(_,index)=><i className={index<item.rating?"filled":""} key={index}>★</i>)}</b></div>
        <div className="contribution-quality"><span>QUALITY</span><div><i style={{width:`${item.quality}%`}}/></div><b>{Math.round(item.quality)}</b></div>
        <div className="contribution-earned"><span>{item.status==="approved"?"VERIFIED":"IN REVIEW"}</span><b>+{item.points}</b><small>{item.weight.toFixed(2)}× weight</small></div>
      </article>)}</div>:<div className="empty-contribution-history"><div><i/><i/><i/></div><h3>No contributions yet.</h3><p>Choose an idea, leave a specific comment, and your verified points will appear here.</p><button className="primary" onClick={onExplore}>Explore ideas →</button></div>}
    </article>
  </section>;
}

function InvestorWorkspace({isDemo,onSignIn,onInsights}:{isDemo:boolean;onSignIn:()=>void;onInsights:()=>void}) {
  const [watching,setWatching]=useState<number[]>([1,3]);
  const toggleWatch=(id:number)=>setWatching(current=>current.includes(id)?current.filter(item=>item!==id):[...current,id]);
  return <section className="workspace-page role-workspace investor-page">
    <DemoModeBar visible={isDemo} role="Investor" onSignIn={onSignIn}/>
    <div className="workspace-heading"><div><span>INVESTOR SIGNAL DESK</span><h1>See where conviction<br/><em>is forming.</em></h1></div><div className="workspace-heading-actions"><button className="outline-btn" onClick={()=>window.print()}>Print weekly brief ↗</button><button className="primary" onClick={onInsights}>Open investor insights →</button></div></div>
    <div className="investor-grid"><article className="trend-radar"><div className="dash-title"><span>CATEGORY MOMENTUM</span><b>Last 30 days</b></div><div className="radar-body"><div className="radar-ring r1"/><div className="radar-ring r2"/><div className="radar-ring r3"/><span className="radar-dot rd1">Health AI<b>+31%</b></span><span className="radar-dot rd2">Future of work<b>+24%</b></span><span className="radar-dot rd3">Climate adaptation<b>+18%</b></span><span className="radar-dot rd4">Learning tools<b>+9%</b></span></div></article><article className="watchlist"><div className="dash-title"><span>HIGH-SIGNAL PROJECTS</span><b>{watching.length} WATCHING</b></div>{ideas.slice(0,3).map(idea=><div key={idea.id}><span style={{background:idea.color}}>{idea.title[0]}</span><p><b>{idea.title}</b><small>{idea.category} · {idea.responses} responses</small></p><strong>{idea.score}</strong><button className={watching.includes(idea.id)?"watching":""} onClick={()=>toggleWatch(idea.id)}>{watching.includes(idea.id)?"✓":"＋"}</button></div>)}</article></div>
    <div className="investor-table"><div><span>PROJECT</span><span>PROBLEM RESONANCE</span><span>RESPONSE QUALITY</span><span>LEARNING VELOCITY</span><span>RISK</span></div>{ideas.map(idea=><button key={idea.id} onClick={onInsights}><span><b>{idea.title}</b><small>{idea.founder}</small></span><span><i style={{width:`${idea.resonance}%`}}/><b>{idea.resonance}</b></span><span>{idea.quality}%</span><span className="up">{idea.trend}</span><span className="risk-tag">{idea.risk<40?"Lower":idea.risk<50?"Market":"Execution"}</span></button>)}</div>
  </section>;
}

function InvestorInsights({onWorkspace}:{onWorkspace:()=>void}){
  const [timeframe,setTimeframe]=useState<"30d"|"90d"|"6m">("30d");
  const [category,setCategory]=useState("All");
  const [minConfidence,setMinConfidence]=useState(70);
  const [selectedId,setSelectedId]=useState(3);
  const [scenario,setScenario]=useState(55);
  const [compareIds,setCompareIds]=useState<number[]>([3,1,2]);
  const filtered=ideas.filter(idea=>(category==="All"||idea.category===category)&&idea.quality>=minConfidence);
  const selected=ideas.find(idea=>idea.id===selectedId)??ideas[0];
  const scenarioScore=Math.max(1,Math.min(99,Math.round(selected.score+(scenario-50)*.18-(selected.risk-40)*.06)));
  const compareIdeas=compareIds.map(id=>ideas.find(idea=>idea.id===id)).filter(Boolean) as Idea[];
  const toggleCompare=(id:number)=>setCompareIds(current=>current.includes(id)?current.filter(item=>item!==id):current.length>=3?[...current.slice(1),id]:[...current,id]);
  return <section className="investor-insights-page">
    <div className="investor-insights-hero">
      <div><span>INVESTOR · INTERACTIVE INSIGHTS</span><h1>Interrogate the signal,<br/><em>not just the score.</em></h1><p>Explore problem resonance, evidence quality, learning velocity, and execution risk across a clearly labeled demonstration dataset.</p></div>
      <div className="investor-hero-score"><span>SELECTED OPPORTUNITY</span><b>{scenarioScore}<small>/100</small></b><h3>{selected.title}</h3><p>{scenario===50?"Base case":scenario>50?"Stronger adoption case":"Conservative adoption case"}</p></div>
    </div>
    <div className="demo-data-ribbon"><span>DEMO MARKET DATA</span><p>These opportunity signals illustrate the investor workflow; they are not live investment recommendations.</p><button onClick={onWorkspace}>Back to signal desk →</button></div>
    <div className="investor-filter-bar">
      <div><span>WINDOW</span>{(["30d","90d","6m"] as const).map(item=><button className={timeframe===item?"active":""} key={item} onClick={()=>setTimeframe(item)}>{item}</button>)}</div>
      <label><span>CATEGORY</span><select value={category} onChange={event=>setCategory(event.target.value)}><option>All</option>{[...new Set(ideas.map(idea=>idea.category))].map(item=><option key={item}>{item}</option>)}</select></label>
      <label><span>MIN EVIDENCE QUALITY</span><input type="range" min="70" max="95" value={minConfidence} onChange={event=>setMinConfidence(Number(event.target.value))}/><b>{minConfidence}%</b></label>
    </div>
    <div className="opportunity-layout">
      <article className="opportunity-map"><div className="platform-card-title"><span>OPPORTUNITY FIELD</span><b>{filtered.length} PROJECTS · {timeframe.toUpperCase()}</b></div><div className="opportunity-axis y"><span>LEARNING VELOCITY</span></div><div className="opportunity-axis x"><span>PROBLEM RESONANCE</span></div><div className="opportunity-grid">{filtered.map(idea=><button key={idea.id} className={selected.id===idea.id?"active":""} style={{left:`${Math.max(9,Math.min(88,idea.resonance-8))}%`,bottom:`${Math.max(10,Math.min(84,idea.velocity-10))}%`,width:`${44+idea.responses/18}px`,height:`${44+idea.responses/18}px`,background:idea.color}} onClick={()=>setSelectedId(idea.id)}><b>{idea.title}</b><small>{idea.score}</small></button>)}{!filtered.length&&<div className="opportunity-empty">Lower the evidence threshold to reveal more projects.</div>}</div></article>
      <aside className="evidence-inspector"><div><span>EVIDENCE INSPECTOR</span><button className={compareIds.includes(selected.id)?"active":""} onClick={()=>toggleCompare(selected.id)}>{compareIds.includes(selected.id)?"✓ Comparing":"＋ Compare"}</button></div><h2>{selected.title}</h2><p>{selected.question}</p><div className="evidence-founder"><i>{selected.founder[0]}</i><span><b>{selected.founder}</b><small>{selected.category} · verified founder</small></span></div>{[["Problem resonance",selected.resonance],["Response quality",selected.quality],["Learning velocity",selected.velocity],["Execution readiness",100-selected.risk]].map(item=><div className="evidence-bar" key={item[0]}><span>{item[0]}</span><i><em style={{width:`${item[1]}%`}}/></i><b>{item[1]}</b></div>)}<blockquote>“The strongest contributor evidence points to a recurring, high-friction problem. Adoption depends on reducing setup effort.”</blockquote><small>MODEL-SUMMARIZED DEMO EVIDENCE</small></aside>
    </div>
    <div className="investor-analysis-grid">
      <article className="scenario-lab"><div className="platform-card-title"><span>SCENARIO LAB</span><b>ADOPTION ASSUMPTION</b></div><div className="scenario-score"><b>{scenarioScore}</b><span>opportunity score</span><i style={{background:`conic-gradient(#d77651 0 ${scenarioScore}%,#e2d7ca ${scenarioScore}% 100%)`}}/></div><label><span>Conservative</span><input type="range" min="0" max="100" value={scenario} onChange={event=>setScenario(Number(event.target.value))}/><span>Optimistic</span></label><p>Adjusting the adoption case changes the displayed opportunity score while keeping evidence quality and risk fixed.</p></article>
      <article className="compare-lab"><div className="platform-card-title"><span>PROJECT COMPARISON</span><b>CLICK A FIELD BUBBLE TO CHANGE</b></div>{compareIdeas.map(idea=><div key={idea.id}><header><span style={{background:idea.color}}>{idea.title[0]}</span><b>{idea.title}</b><button onClick={()=>toggleCompare(idea.id)}>×</button></header><p><span>Signal</span><i><em style={{width:`${idea.score}%`}}/></i><b>{idea.score}</b></p><p><span>Quality</span><i><em style={{width:`${idea.quality}%`}}/></i><b>{idea.quality}</b></p><p><span>Risk</span><i className="risk"><em style={{width:`${idea.risk}%`}}/></i><b>{idea.risk}</b></p></div>)}</article>
      <article className="consensus-card"><div className="platform-card-title"><span>CONSENSUS SHAPE</span><b>{selected.responses} RESPONSES</b></div><div className="consensus-visual">{[18,26,41,67,92,74,48,29,16].map((height,index)=><i key={index} style={{height:`${height}%`,animationDelay:`${index*.05}s`}}/>)}</div><h3>{selected.quality>=90?"High-quality agreement":"Constructive disagreement"}</h3><p>{selected.quality}% evidence quality with {selected.risk}% modeled risk. Review underlying responses before forming an investment conclusion.</p></article>
    </div>
  </section>;
}

function AnalyticsModel({apiFetch}:{apiFetch:ApiFetch}) {
  const [live, setLive] = useState<null | { responseCount:number; signalScore:number; confidence:number; averageQuality:number; themes:Array<{name:string;evidence:number}> }>(null);
  useEffect(() => {
    apiFetch("/api/analyze")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.responseCount > 0) setLive(data); })
      .catch(() => undefined);
  }, [apiFetch]);
  const contributors=[["Priya S.","Healthcare UX","94","1.28×","Supportive"],["Daniel R.","Operations","89","1.21×","Concerned"],["Mei L.","Consumer research","86","1.16×","Supportive"],["Jordan K.","Student founder","74","0.98×","Mixed"],["Alex T.","General audience","42","0.46×","Low detail"]];
  const responseCount = live?.responseCount ?? 284;
  const signalScore = live?.signalScore ?? 87;
  const confidence = live?.confidence ?? 94;
  const displayThemes = live?.themes?.slice(0,5).map((x,i)=>[x.name,Math.round(x.evidence*100),i===0?"Primary driver":"Observed pattern"] as [string,number,string]) ?? [["Doorstep convenience",68,"Demand driver"],["Pickup reliability",57,"Core concern"],["Deposit friction",39,"Adoption risk"],["Hygiene confidence",34,"Trust barrier"],["Environmental value",61,"Emotional benefit"]] as [string,number,string][];
  return <section className="workspace-page role-workspace analytics-page">
    <div className="workspace-heading"><div><span>INSIGHT MODEL v1.2</span><h1>{responseCount} responses.<br/><em>One decision-ready view.</em></h1></div><div className="model-status"><span>● {live ? "LIVE DATABASE ANALYSIS" : "DEMO BASELINE"}</span><small>{live ? "Computed from stored contributor responses" : "Live results replace this view after collection"}</small></div></div>
    <div className="analysis-summary"><article><span>VALIDATION SCORE</span><h2>{signalScore}<small>/100</small></h2><b>{signalScore >= 75 ? "Strong problem signal" : "Signal still forming"}</b><p>Weighted demand is calculated after low-quality and duplicate responses are down-weighted.</p></article><article><span>MODEL CONCLUSION</span><h3>{live ? `${displayThemes[0]?.[0] ?? "One theme"} leads the evidence.` : "Convenience is the adoption lever."}</h3><p>{live ? `The live model found ${displayThemes[0]?.[1] ?? 0}% weighted evidence for this theme across stored responses.` : "Users mention sustainability positively, but pickup reliability explains 3.2× more willingness to switch."}</p><button>Generate next experiment →</button></article><article><span>CONFIDENCE</span><h2>{confidence}<small>%</small></h2><b>{confidence >= 80 ? "Stable analysis" : "More data needed"}</b><p>{live ? `Average contributor quality is ${Math.round(live.averageQuality)} out of 100.` : "Sample diversity is adequate. Parent and suburban cohorts remain underrepresented."}</p></article></div>
    <div className="analysis-grid"><article className="theme-analysis"><div className="dash-title"><span>WEIGHTED THEMES</span><b>Evidence share</b></div>{displayThemes.map((x,i)=><div className="analysis-theme" key={x[0]}><b>{String(i+1).padStart(2,"0")}</b><p><strong>{x[0]}</strong><small>{x[2]}</small></p><i><em style={{width:`${x[1]}%`}}/></i><span>{x[1]}%</span></div>)}</article><article className="segment-analysis"><div className="dash-title"><span>SEGMENT DIFFERENCE</span><b>Signal score</b></div><div className="segment-bars">{[["Gen Z",92],["Urban professionals",88],["Parents",76],["Suburban users",61]].map(x=><div key={x[0]}><span>{x[0]}</span><i><em style={{width:`${x[1]}%`}}/></i><b>{x[1]}</b></div>)}</div><div className="analysis-note"><span>✦</span><p><b>Model observation</b> Urban density changes logistics confidence more than age changes intent.</p></div></article></div>
    <article className="contributor-analysis"><div className="dash-title"><span>CONTRIBUTOR-LEVEL ANALYSIS</span><b>Quality score determines analytical weight</b></div><div className="contributor-table"><div><span>CONTRIBUTOR</span><span>RELEVANT CONTEXT</span><span>QUALITY</span><span>MODEL WEIGHT</span><span>STANCE</span></div>{contributors.map((c,i)=><div key={c[0]}><span><i>{c[0][0]}</i><b>{c[0]}</b></span><span>{c[1]}</span><span><em style={{width:`${c[2]}%`}}/><b>{c[2]}</b></span><span className={i===4?"down-weight":""}>{c[3]}</span><span>{c[4]}</span></div>)}</div><div className="method-row"><p><b>How this model works:</b> specificity 30% · constructiveness 25% · domain relevance 20% · consistency 15% · duplicate/incentive risk 10%. Reputation modifies the final weight within a capped range.</p><button>View methodology →</button></div></article>
  </section>
}

const profileCopy={
  en:{eyebrow:"PERSONAL SIGNAL PROFILE",titleA:"Your work.",titleB:"Your perspective.",verified:"Verified identity",uploading:"Uploading…",changePhoto:"Change photo",edit:"Edit profile",close:"Close editor",website:"Website",fallbackHeadline:"Add a headline that tells the network what you build or understand.",reputation:"REPUTATION",membership:"MEMBERSHIP",strength:"PROFILE STRENGTH",language:"LANGUAGE",role:"Role",context:"More context improves matching",editor:"PROFILE EDITOR",saved:"Saved across your account",displayName:"Display name",headline:"Headline",headlinePlaceholder:"What should people know first?",location:"Location",locationPlaceholder:"City or region",aboutYou:"About you",aboutPlaceholder:"Share your background, current focus, and the perspectives you bring.",interests:"INTERESTS & EXPERTISE",saving:"Saving…",save:"Save profile →",updated:"Profile updated",updateFailed:"Profile could not be updated",photoUpdated:"Profile image updated",photoFailed:"Use a JPG, PNG, WebP, or GIF under 3 MB",about:"ABOUT",publicPreview:"Public profile preview",emptyBio:"Your introduction will appear here. Add the problems you care about, your experience, and the kind of ideas you want to meet.",noInterests:"No interests selected yet",activity:"CONTRIBUTION RHYTHM",recent:"Recent 12 weeks",activityNote:"This visual becomes your verified activity history as you use InsightLab.",readiness:"PROFILE READINESS",completion:"complete",complete:"Complete",missing:"Add next",account:"ACCOUNT & PREFERENCES",identity:"Verified contact",email:"Email",phone:"Phone",notAdded:"Not added",languagePreference:"Interface language",languageNote:"Synced to this account and this device.",privacy:"PRIVACY BOUNDARY",privacyNote:"Your contact details stay private. Your public profile shows only the context you choose to share."},
  zh:{eyebrow:"个人信号档案",titleA:"你的经历。",titleB:"你的独特视角。",verified:"身份已验证",uploading:"上传中…",changePhoto:"更换头像",edit:"编辑个人主页",close:"关闭编辑",website:"个人网站",fallbackHeadline:"添加一句简介，让平台了解你正在打造或擅长理解什么。",reputation:"信誉分",membership:"会员等级",strength:"资料完整度",language:"界面语言",role:"身份",context:"资料越完整，匹配越准确",editor:"编辑个人资料",saved:"保存后会同步到你的账号",displayName:"显示名称",headline:"一句话简介",headlinePlaceholder:"别人最先应该了解你什么？",location:"所在地区",locationPlaceholder:"城市或地区",aboutYou:"个人介绍",aboutPlaceholder:"介绍你的经历、当前关注点，以及你能带来的独特视角。",interests:"兴趣与专业领域",saving:"保存中…",save:"保存个人资料 →",updated:"个人资料已更新",updateFailed:"暂时无法更新个人资料",photoUpdated:"头像已更新",photoFailed:"请使用 3 MB 以内的 JPG、PNG、WebP 或 GIF",about:"关于我",publicPreview:"公开主页预览",emptyBio:"你的个人介绍会显示在这里。写下你关注的问题、相关经历，以及希望遇见的创意类型。",noInterests:"尚未选择兴趣领域",activity:"贡献活跃度",recent:"最近 12 周",activityNote:"开始使用 InsightLab 后，这里会显示经过验证的真实活动记录。",readiness:"资料准备度",completion:"已完成",complete:"已完善",missing:"下一步补充",account:"账号与偏好",identity:"已验证联系方式",email:"邮箱",phone:"手机号",notAdded:"未添加",languagePreference:"界面语言",languageNote:"已同步到当前账号与设备。",privacy:"隐私边界",privacyNote:"联系方式不会公开；公开主页只展示你主动选择分享的资料。"},
  es:{eyebrow:"PERFIL DE SEÑAL PERSONAL",titleA:"Tu trabajo.",titleB:"Tu perspectiva.",verified:"Identidad verificada",uploading:"Subiendo…",changePhoto:"Cambiar foto",edit:"Editar perfil",close:"Cerrar editor",website:"Sitio web",fallbackHeadline:"Añade una frase sobre lo que construyes o comprendes.",reputation:"REPUTACIÓN",membership:"MEMBRESÍA",strength:"PERFIL COMPLETO",language:"IDIOMA",role:"Rol",context:"Más contexto mejora tus coincidencias",editor:"EDITOR DE PERFIL",saved:"Guardado en toda tu cuenta",displayName:"Nombre visible",headline:"Titular",headlinePlaceholder:"¿Qué deberían saber primero?",location:"Ubicación",locationPlaceholder:"Ciudad o región",aboutYou:"Sobre ti",aboutPlaceholder:"Comparte tu experiencia, enfoque actual y la perspectiva que aportas.",interests:"INTERESES Y EXPERIENCIA",saving:"Guardando…",save:"Guardar perfil →",updated:"Perfil actualizado",updateFailed:"No se pudo actualizar el perfil",photoUpdated:"Foto de perfil actualizada",photoFailed:"Usa JPG, PNG, WebP o GIF de menos de 3 MB",about:"ACERCA DE",publicPreview:"Vista previa pública",emptyBio:"Tu presentación aparecerá aquí. Añade los problemas que te importan, tu experiencia y las ideas que quieres conocer.",noInterests:"Aún no hay intereses",activity:"RITMO DE CONTRIBUCIÓN",recent:"Últimas 12 semanas",activityNote:"Este gráfico se convertirá en tu historial verificado al usar InsightLab.",readiness:"PREPARACIÓN DEL PERFIL",completion:"completo",complete:"Completo",missing:"Añadir",account:"CUENTA Y PREFERENCIAS",identity:"Contacto verificado",email:"Correo",phone:"Teléfono",notAdded:"Sin añadir",languagePreference:"Idioma de interfaz",languageNote:"Sincronizado con esta cuenta y dispositivo.",privacy:"LÍMITE DE PRIVACIDAD",privacyNote:"Tus datos de contacto son privados. El perfil público solo muestra lo que decides compartir."},
} satisfies Record<Locale,Record<string,string>>;

function ProfilePage({profile,apiFetch,locale,onLocaleChange,onSaved,notify}:{profile:UserProfile;apiFetch:ApiFetch;locale:Locale;onLocaleChange:(locale:Locale)=>void;onSaved:(profile:UserProfile)=>void;notify:(message:string)=>void}) {
  const [editing,setEditing]=useState(false);
  const [saving,setSaving]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [form,setForm]=useState({
    displayName:profile.displayName,
    headline:profile.headline,
    bio:profile.bio,
    location:profile.location,
    website:profile.website,
    interests:profile.interests,
    coverStyle:profile.coverStyle||"signal",
  });
  const t=profileCopy[locale];
  const initials=form.displayName.split(/\s/).filter(Boolean).map(item=>item[0]).slice(0,2).join("").toUpperCase()||"IL";
  const allInterests=["AI & Data","Climate","Digital Health","Future of Work","Education","Consumer","Fintech","Creator Economy"];
  const completionItems=[{label:t.headline,complete:Boolean(profile.headline)},{label:t.aboutYou,complete:Boolean(profile.bio)},{label:t.location,complete:Boolean(profile.location)},{label:t.website,complete:Boolean(profile.website)},{label:t.interests,complete:profile.interests.length>0},{label:t.changePhoto,complete:Boolean(profile.avatarUrl)}];
  const completed=completionItems.filter(item=>item.complete).length;
  const strength=Math.round(40+(completed/completionItems.length)*60);
  const safeEmail=profile.email.startsWith("phone:")?"":profile.email;
  const activeLanguage=languageOptions.find(option=>option.value===locale)?.longLabel??"English";
  const toggle=(interest:string)=>setForm(current=>({...current,interests:current.interests.includes(interest)?current.interests.filter(item=>item!==interest):[...current.interests,interest].slice(0,8)}));
  const save=async()=>{
    setSaving(true);
    const response=await apiFetch("/api/profile",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...form,role:profile.role,preferredLanguage:locale})});
    if(response.ok){
      const data=await response.json() as {profile:UserProfile};
      onSaved(data.profile);
      setEditing(false);
      notify(t.updated);
    }else notify(t.updateFailed);
    setSaving(false);
  };
  const upload=async(event:React.ChangeEvent<HTMLInputElement>)=>{
    const file=event.target.files?.[0];
    if(!file)return;
    setUploading(true);
    const body=new FormData();
    body.append("avatar",file);
    const response=await apiFetch("/api/avatar",{method:"POST",body});
    if(response.ok){
      const data=await response.json() as {avatarUrl:string};
      onSaved({...profile,avatarUrl:data.avatarUrl});
      notify(t.photoUpdated);
    }else notify(t.photoFailed);
    setUploading(false);
  };
  return <section className="workspace-page profile-page">
    <div className="profile-cover" data-cover={form.coverStyle}><div className="profile-cover-grid"/><div className="profile-cover-copy"><span>{t.eyebrow}</span><h1>{t.titleA}<br/><em>{t.titleB}</em></h1></div><div className="profile-cover-signal"><i/><span><b>● {t.verified}</b><small>{profile.role.toUpperCase()} · {profile.memberTier.toUpperCase()}</small></span></div></div>
    <div className="profile-shell">
      <aside className="profile-identity">
        <label className="profile-avatar">
          {profile.avatarUrl?<span className="profile-avatar-image" role="img" aria-label={`${profile.displayName} profile`} style={{backgroundImage:`url("${profile.avatarUrl}")`}}/>:<span>{initials}</span>}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={upload}/>
          <i>{uploading?t.uploading:t.changePhoto}</i>
        </label>
        <div className="profile-verified"><i/> {t.verified}</div>
        <span className="profile-role">{profile.role}</span>
        <h2>{profile.displayName}</h2>
        <p>{profile.headline||t.fallbackHeadline}</p>
        <div className="profile-meta">{profile.location&&<span>⌖ {profile.location}</span>}{profile.website&&<a href={profile.website.startsWith("http")?profile.website:`https://${profile.website}`} target="_blank" rel="noreferrer">↗ {t.website}</a>}</div>
        <button className="outline-btn profile-edit-button" onClick={()=>setEditing(current=>!current)}>{editing?t.close:t.edit}</button>
        <div className="profile-mini-completion"><span><b>{strength}%</b><small>{t.strength}</small></span><i style={{background:`conic-gradient(#c96d4b ${strength*3.6}deg,#e8ddd1 0deg)`}}><em/></i></div>
      </aside>
      <div className="profile-main">
        <div className="profile-score-row"><article><span>{t.reputation}</span><b>{Math.round(profile.reputationScore)}</b><i><em style={{width:`${Math.min(100,profile.reputationScore/10)}%`}}/></i></article><article><span>{t.membership}</span><b>{profile.memberTier}</b><small>{t.role}: {profile.role}</small></article><article><span>{t.strength}</span><b>{strength}%</b><small>{t.context}</small></article><article><span>{t.language}</span><b className="profile-language-value">{activeLanguage}</b><small>{languageOptions.find(option=>option.value===locale)?.label}</small></article></div>
        {editing?<article className="profile-editor"><div className="dash-title"><span>{t.editor}</span><b>{t.saved}</b></div><div className="cover-picker"><span>{locale==="zh"?"主页背景":locale==="es"?"Fondo del perfil":"Profile background"}</span><div>{(["signal","ember","forest","constellation"] as const).map(item=><button type="button" aria-label={item} className={form.coverStyle===item?"active":""} data-cover={item} key={item} onClick={()=>setForm({...form,coverStyle:item})}><i/><b>{item}</b></button>)}</div></div><div className="profile-form-grid"><label>{t.displayName}<input value={form.displayName} onChange={event=>setForm({...form,displayName:event.target.value})}/></label><label>{t.headline}<input value={form.headline} onChange={event=>setForm({...form,headline:event.target.value})} placeholder={t.headlinePlaceholder}/></label><label>{t.location}<input value={form.location} onChange={event=>setForm({...form,location:event.target.value})} placeholder={t.locationPlaceholder}/></label><label>{t.website}<input value={form.website} onChange={event=>setForm({...form,website:event.target.value})} placeholder="your-site.com"/></label></div><label>{t.aboutYou}<textarea value={form.bio} onChange={event=>setForm({...form,bio:event.target.value})} placeholder={t.aboutPlaceholder}/></label><div className="profile-interest-edit"><span>{t.interests}</span><div>{allInterests.map(item=><button type="button" key={item} className={form.interests.includes(item)?"active":""} onClick={()=>toggle(item)}>{item}</button>)}</div></div><div className="profile-editor-language"><span>{t.languagePreference}</span><LanguageSwitcher locale={locale} onChange={onLocaleChange}/><small>{t.languageNote}</small></div><button className="primary" disabled={saving||form.displayName.trim().length<2} onClick={save}>{saving?t.saving:t.save}</button></article>:<>
          <article className="profile-about"><div className="dash-title"><span>{t.about}</span><b>{t.publicPreview}</b></div><p>{profile.bio||t.emptyBio}</p><div className="profile-interest-list">{profile.interests.length?profile.interests.map(item=><span key={item}>{item}</span>):<span className="empty">{t.noInterests}</span>}</div></article>
          <div className="profile-dashboard-grid"><article className="profile-activity-preview"><div className="dash-title"><span>{t.activity}</span><b>{t.recent}</b></div><div>{[18,26,20,42,35,58,71,54,80,63,88,76].map((value,index)=><i key={index} style={{height:`${value}%`,animationDelay:`${index*.04}s`}}/>)}</div><small>{t.activityNote}</small></article><article className="profile-readiness"><div className="dash-title"><span>{t.readiness}</span><b>{strength}% {t.completion}</b></div><div>{completionItems.map(item=><p key={item.label} className={item.complete?"complete":""}><i>{item.complete?"✓":"＋"}</i><span>{item.label}</span><b>{item.complete?t.complete:t.missing}</b></p>)}</div></article></div>
          <article className="profile-preferences"><div className="dash-title"><span>{t.account}</span><b>{t.identity}</b></div><div className="profile-preference-grid"><section><span>{t.identity}</span><p><i>✓</i><b>{t.email}</b><small>{safeEmail||t.notAdded}</small></p><p className={profile.phone?"":"muted"}><i>{profile.phone?"✓":"○"}</i><b>{t.phone}</b><small>{profile.phone||t.notAdded}</small></p></section><section><span>{t.languagePreference}</span><LanguageSwitcher locale={locale} onChange={onLocaleChange}/><small>{t.languageNote}</small></section><section className="profile-privacy-card"><span>{t.privacy}</span><div><i/><i/><i/></div><p>{t.privacyNote}</p></section></div></article>
        </>}
      </div>
    </div>
  </section>;
}

type AdminData = {
  metrics: { users:number; online:number; validations:number; responses:number; newUsers7d:number };
  roles: Array<{ role:string; count:number }>;
  users: Array<{ displayName:string; email:string; phone:string|null; role:string; memberTier:string; reputationScore:number; pointsBalance:number; createdAt:string; lastSeen:number|null }>;
  activity: Array<{ day:string; count:number }>;
  posts:Array<{id:number;title:string;description:string;category:string;status:string;author:string;createdAt:string}>;
  comments:Array<{id:number;body:string;rating:number;integrityScore:number;moderationStatus:string;author:string;ideaTitle:string;createdAt:string}>;
  asOf: string;
};

export function AdminDashboard({apiFetch,locale="en"}:{apiFetch:ApiFetch;locale?:Locale}) {
  const [data,setData]=useState<AdminData|null>(null);
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");
  const [asOf,setAsOf]=useState(0);
  const [contentTab,setContentTab]=useState<"posts"|"comments">("posts");
  const copy=locale==="zh"?{console:"管理控制台",title:"InsightLab 运营中心",live:"实时同步 · 每10秒",users:"注册用户",posts:"帖子管理",comments:"评论管理",remove:"删除",restore:"恢复",content:"内容治理",points:"积分",search:"搜索姓名、邮箱或身份"}:locale==="es"?{console:"CONSOLA DE ADMINISTRACIÓN",title:"Centro de control InsightLab",live:"Sincronización · 10 segundos",users:"Usuarios registrados",posts:"Publicaciones",comments:"Comentarios",remove:"Eliminar",restore:"Restaurar",content:"Moderación",points:"Puntos",search:"Buscar nombre, correo o rol"}:{console:"OWNER CONSOLE",title:"InsightLab control room",live:"Live sync · every 10 seconds",users:"Registered users",posts:"Posts",comments:"Comments",remove:"Remove",restore:"Restore",content:"Content moderation",points:"Points",search:"Search name, email, or role"};
  useEffect(()=>{
    let active=true;
    const load=async()=>{
      try{
        const response=await apiFetch("/api/admin");
        if(!response.ok)throw new Error("Admin data unavailable");
        const next=await response.json() as AdminData;
        if(active){setData(next);setAsOf(new Date(next.asOf).getTime());setError("");}
      }catch{if(active)setError("The management data could not be loaded.");}
    };
    load();
    const timer=window.setInterval(load,10_000);
    const onVisibility=()=>{if(document.visibilityState==="visible")void load();};
    document.addEventListener("visibilitychange",onVisibility);
    return()=>{active=false;window.clearInterval(timer);document.removeEventListener("visibilitychange",onVisibility);};
  },[apiFetch]);
  const users=(data?.users??[]).filter(user=>(user.displayName+" "+user.email+" "+(user.phone??"")+" "+user.role).toLowerCase().includes(query.toLowerCase()));
  const metrics=[
    ["LIVE NOW",data?.metrics.online??0,"pulse"],
    ["REGISTERED USERS",data?.metrics.users??0,"people"],
    ["ACTIVE VALIDATIONS",data?.metrics.validations??0,"studies"],
    ["STORED RESPONSES",data?.metrics.responses??0,"responses"],
  ];
  const roleTotal=(data?.roles??[]).reduce((sum,item)=>sum+item.count,0);
  const roleDenominator=Math.max(1,roleTotal);
  const founder=(data?.roles.find(r=>r.role==="founder")?.count??0)/roleDenominator*100;
  const contributor=(data?.roles.find(r=>r.role==="contributor")?.count??0)/roleDenominator*100;
  const activityDays=useMemo(()=>{
    if(!asOf)return [];
    const counts=new Map((data?.activity??[]).map(item=>[item.day,item.count]));
    return Array.from({length:7},(_,index)=>{
      const date=new Date(asOf-(6-index)*86_400_000).toISOString().slice(0,10);
      return {day:date,count:counts.get(date)??0};
    });
  },[asOf,data?.activity]);
  const maxActivity=Math.max(1,...activityDays.map(item=>item.count));
  const moderate=async(type:"post"|"comment",id:number,action:"remove"|"restore")=>{
    const response=await apiFetch("/api/admin",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({type,id,action})});
    if(response.ok){
      const next=await apiFetch("/api/admin");
      if(next.ok){const payload=await next.json() as AdminData;setData(payload);setAsOf(new Date(payload.asOf).getTime());}
    }
  };
  return <section className="workspace-page admin-page">
    <div className="workspace-heading"><div><span>{copy.console}</span><h1>{copy.title}</h1></div><div className="admin-live"><i/>{copy.live}</div></div>
    {error&&<div className="admin-error">{error}</div>}
    <div className="admin-metrics">{metrics.map((metric,index)=><article key={metric[0]}><div className={`admin-icon ${metric[2]}`}>{index===0?<><i/><i/><i/></>:index===1?<><i/><i/></>:index===2?<><i/><i/><i/></>:<><i/><i/><i/><i/></>}</div><p><span>{metric[0]}</span><b>{metric[1].toLocaleString()}</b></p>{index===1&&<small>+{data?.metrics.newUsers7d??0} this week</small>}</article>)}</div>
    <div className="admin-visuals">
      <article className="admin-activity"><div className="dash-title"><span>7-DAY USER ACTIVITY</span><b>Database events</b></div><div className="activity-chart">{activityDays.map((item,index)=><div key={item.day}><i className={item.count===0?"zero":""} style={{height:item.count===0?"2px":`${Math.max(10,item.count/maxActivity*100)}%`,animationDelay:`${index*.08}s`}}/><b>{item.count}</b><span>{new Date(`${item.day}T12:00:00Z`).toLocaleDateString(undefined,{weekday:"short"})}</span></div>)}</div></article>
      <article className="admin-roles"><div className="dash-title"><span>ROLE DISTRIBUTION</span><b>{roleTotal} profiles</b></div><div className="role-donut" style={{background:roleTotal?`conic-gradient(#d66a45 0 ${founder}%,#81917b ${founder}% ${founder+contributor}%,#b69578 ${founder+contributor}% 100%)`:"rgba(255,255,255,.08)"}}><div><b>{roleTotal}</b><span>users</span></div></div><div className="role-legend"><span><i/>Founder</span><span><i/>Contributor</span><span><i/>Investor</span></div></article>
      <article className="admin-health"><div className="dash-title"><span>SYSTEM STATUS</span><b className="healthy">All healthy</b></div>{[["Identity","Secure"],["D1 database","Connected"],["Insight model","v1.2"],["Presence window","120 sec"]].map(item=><div key={item[0]}><i/><span>{item[0]}</span><b>{item[1]}</b></div>)}</article>
    </div>
    <article className="admin-users">
      <div className="admin-users-head"><div><span>USER DIRECTORY</span><h2>{copy.users}</h2></div><label><span>⌕</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder={copy.search}/></label></div>
      <div className="admin-user-table"><div><span>USER</span><span>ROLE</span><span>MEMBERSHIP</span><span>{copy.points}</span><span>REPUTATION</span><span>STATUS</span></div>{users.length?users.map(user=>{const online=Boolean(user.lastSeen&&asOf-user.lastSeen<120_000);return <div key={user.email}><span><i>{user.displayName.slice(0,1).toUpperCase()}</i><p><b>{user.displayName}</b><small>{user.phone??user.email.replace(/^phone:/,"")}</small></p></span><span className="admin-role">{user.role}</span><span>{user.memberTier}</span><span><b>{user.pointsBalance??100}</b></span><span><em style={{width:`${Math.min(100,user.reputationScore/10)}%`}}/><b>{Math.round(user.reputationScore)}</b></span><span className={online?"online":"offline"}><i/>{online?"Online":"Offline"}</span></div>}):<div className="empty-users"><span>No matching profiles yet.</span></div>}</div>
    </article>
    <article className="admin-moderation">
      <div className="admin-users-head"><div><span>{copy.content}</span><h2>{contentTab==="posts"?copy.posts:copy.comments}</h2></div><div className="moderation-tabs"><button className={contentTab==="posts"?"active":""} onClick={()=>setContentTab("posts")}>{copy.posts}</button><button className={contentTab==="comments"?"active":""} onClick={()=>setContentTab("comments")}>{copy.comments}</button></div></div>
      <div className="moderation-list">{contentTab==="posts"?(data?.posts??[]).map(item=><div key={item.id}><span className={`content-status ${item.status}`}>{item.status}</span><p><b>{item.title}</b><small>{item.author} · {item.category}</small><em>{item.description}</em></p><button onClick={()=>moderate("post",item.id,item.status==="archived"?"restore":"remove")}>{item.status==="archived"?copy.restore:copy.remove}</button></div>):(data?.comments??[]).map(item=><div key={item.id}><span className={`content-status ${item.moderationStatus}`}>{Math.round(item.integrityScore)} integrity</span><p><b>{item.ideaTitle}</b><small>{item.author} · ★ {item.rating}</small><em>{item.body||"Rating only"}</em></p><button onClick={()=>moderate("comment",item.id,item.moderationStatus==="removed"?"restore":"remove")}>{item.moderationStatus==="removed"?copy.restore:copy.remove}</button></div>)}</div>
    </article>
    <div className="admin-note"><span>PRIVACY CONTROL</span><p>This console is restricted server-side to the owner account. It shows operational data needed to run InsightLab; passwords and private authentication credentials are never stored.</p></div>
  </section>
}

function Rewards({notify,apiFetch,locale,signedIn,onSignIn}:{notify:(s:string)=>void;apiFetch:ApiFetch;locale:Locale;signedIn:boolean;onSignIn:()=>void}) {
  const [data,setData]=useState<{account:{pointsBalance:number;memberTier:string;reputationScore:number};ledger:Array<{id:number;amount:number;balanceAfter:number;reason:string;createdAt:string}>}|null>(null);
  const [busy,setBusy]=useState("");
  const text=locale==="zh"?{eyebrow:"积分、会员与回馈",title:"每一次真实贡献，都形成长期价值。",balance:"可用积分",reputation:"信誉分",membership:"当前会员",redeem:"兑换",history:"积分记录",payment:"会员付费",paymentNote:"支付通道已预留。绑定正式商户账户后才会真实扣款。",signin:"登录查看真实积分",pending:"兑换申请已提交，等待管理员审核。"}:locale==="es"?{eyebrow:"PUNTOS, MEMBRESÍA Y RECOMPENSAS",title:"Cada aporte auténtico genera valor.",balance:"Puntos disponibles",reputation:"Reputación",membership:"Membresía",redeem:"Canjear",history:"Historial de puntos",payment:"Pago de membresía",paymentNote:"Los pagos requieren una cuenta comercial verificada antes de cobrar.",signin:"Inicia sesión para ver tus puntos",pending:"Solicitud enviada para revisión."}:{eyebrow:"POINTS, MEMBERSHIP & REWARDS",title:"Every genuine contribution compounds.",balance:"Available points",reputation:"Reputation",membership:"Membership",redeem:"Redeem",history:"Points history",payment:"Membership payment",paymentNote:"Payment rails are prepared, but a verified merchant account is required before any real charge.",signin:"Sign in to view real points",pending:"Redemption submitted for admin review."};
  const load=useCallback(()=>{if(!signedIn)return;void apiFetch("/api/rewards").then(response=>response.ok?response.json():null).then(next=>next&&setData(next));},[apiFetch,signedIn]);
  useEffect(()=>load(),[load]);
  const redeem=async(code:string)=>{
    if(!signedIn)return onSignIn();
    setBusy(code);
    const response=await apiFetch("/api/rewards",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({rewardCode:code})});
    const result=await response.json() as {error?:string};
    notify(response.ok?text.pending:result.error??"Redemption unavailable");
    setBusy("");load();
  };
  const balance=data?.account.pointsBalance??0;
  return <section className="workspace-page rewards-market">
    <div className="workspace-heading"><div><span>{text.eyebrow}</span><h1>{text.title}</h1></div></div>
    <div className="reward-wallet"><article><span>{text.balance}</span><b>{signedIn?balance.toLocaleString():"—"} <small>PTS</small></b><i><em style={{width:`${Math.min(100,balance/30)}%`}}/></i><button onClick={signedIn?undefined:onSignIn}>{signedIn?`ID · ${data?.account.memberTier??"free"}`:text.signin}</button></article><article><span>{text.reputation}</span><b>{data?.account.reputationScore??0}</b><small>/ 1000</small></article><article><span>{text.membership}</span><b>{data?.account.memberTier??"FREE"}</b><small>InsightLab member</small></article></div>
    <div className="reward-catalog">{[{code:"coffee",cost:500,title:"Partner coffee credit",icon:"☕"},{code:"cash10",cost:1200,title:"$10 cash-back review",icon:"$"},{code:"proMonth",cost:2500,title:"InsightLab Pro · 1 month",icon:"✦"}].map(item=><article key={item.code}><i>{item.icon}</i><h2>{item.title}</h2><p>{item.cost.toLocaleString()} pts</p><button disabled={busy===item.code} onClick={()=>redeem(item.code)}>{busy===item.code?"…":text.redeem}</button></article>)}</div>
    <div className="billing-panel"><div><span>{text.payment}</span><h2>InsightLab Pro</h2><p>{text.paymentNote}</p></div><div className="payment-methods"><button disabled><b></b> Apple Pay</button><button disabled><b>微</b> WeChat Pay</button><button disabled><b>▰</b> Card</button></div></div>
    <article className="points-ledger"><div className="dash-title"><span>{text.history}</span><b>{data?.ledger.length??0} entries</b></div>{data?.ledger.length?data.ledger.map(item=><div key={item.id}><span className={item.amount>=0?"plus":"minus"}>{item.amount>=0?"+":""}{item.amount}</span><p><b>{item.reason}</b><small>{new Date(item.createdAt).toLocaleString()}</small></p><strong>{item.balanceAfter} pts</strong></div>):<p className="empty-ledger">{signedIn?"No point activity yet.":text.signin}</p>}</article>
  </section>;
}

function DemoModeBar({visible,role,onSignIn}:{visible:boolean;role:string;onSignIn:()=>void}){
  if(!visible)return null;
  return <div className="demo-mode-bar"><span>INTERACTIVE {role.toUpperCase()} DEMO</span><p>Explore the full workflow with sample data. Sign in to store files, save work, and build verified history.</p><button onClick={onSignIn}>Sign in to make it live →</button></div>;
}

function TrustCenter(){
  const layers=[
    {number:"01",title:"Founder control",copy:"Choose public discovery, a targeted audience, or a private link. Uploaded research files stay private and are stored separately from the public idea feed.",tone:"founder"},
    {number:"02",title:"Contributor consent",copy:"Every task shows its effort level, expected reward, and required fields before submission. Positive sentiment is never required to earn points.",tone:"contributor"},
    {number:"03",title:"Evidence integrity",copy:"Specificity, constructiveness, duplicate similarity, historical consistency, and reputation influence analytical weight. Low-confidence feedback remains visible but counts less.",tone:"integrity"},
    {number:"04",title:"Human accountability",copy:"Models organize patterns and flag risk; they do not decide whether an idea should be built or funded. Founders and investors remain accountable for judgment.",tone:"human"},
  ];
  return <section className="trust-page">
    <div className="trust-hero"><span>TRUST CENTER</span><h1>Useful evidence needs<br/><em>visible rules.</em></h1><p>InsightLab is designed around consent, scoped access, transparent weighting, and clear ownership of decisions.</p><div className="trust-shield"><i/><i/><i/><span><b>4</b><small>control layers</small></span></div></div>
    <div className="trust-principles">{layers.map(layer=><article className={layer.tone} key={layer.number}><span>{layer.number}</span><div className="trust-glyph"><i/><i/><i/></div><h2>{layer.title}</h2><p>{layer.copy}</p></article>)}</div>
    <div className="reputation-explainer"><div><span>CONTINUOUS REPUTATION</span><h2>One score,<br/>recalculated after every contribution.</h2><p>The newest response does not erase a contributor’s history. It updates a rolling trust signal using bounded quality and integrity factors.</p></div><div className="reputation-flow"><article><b>742</b><span>Prior reputation</span></article><i>＋</i><article><b>91</b><span>Response quality</span></article><i>−</i><article><b>4%</b><span>Duplicate risk</span></article><i>→</i><article className="result"><b>746</b><span>New reputation</span></article></div></div>
    <div className="trust-boundary"><span>BEFORE PUBLIC LAUNCH</span><p>InsightLab still needs counsel-reviewed Privacy, Terms of Service, reward/tax, intellectual-property, moderation, and data-retention policies. The current Trust Center explains the product design; it is not a substitute for those legal documents.</p></div>
  </section>;
}

function HelpCenter({onStart}:{onStart:()=>void}){
  const questions=[
    ["What can each role do?","Founders design idea validations and surveys; contributors rate, comment, or answer surveys; investors compare structured market signals and project evidence."],
    ["How are contributor points calculated?","Each effort level has a base reward. The final award is multiplied by integrity and quality signals, including specificity, duplicate risk, consistency, and current reputation."],
    ["Does a negative response earn fewer points?","No. Sentiment and quality are separate. A specific, constructive objection can receive more weight than vague praise."],
    ["Who can see founder files?","Uploaded context is treated as private founder material. Public discovery shows only the study content the founder intentionally publishes."],
    ["Can I publish only an idea without a survey?","Yes. Founder Studio supports an Idea only format with a quick rating and optional reasoned comment, as well as a guided custom survey."],
    ["How does verification-code login become live?","The interface is prepared for email and phone OTP through Supabase. The project URL, publishable key, delivery providers, redirect URLs, and production message templates must be configured before real codes are sent."],
  ];
  const [open,setOpen]=useState(0);
  return <section className="help-page"><div className="help-hero"><span>HELP CENTER</span><h1>Start with the workflow.<br/><em>Keep the rules clear.</em></h1><p>Answers for founders, contributors, and investors—before you commit time, data, or points.</p><button className="primary" onClick={onStart}>Try a role demo →</button></div><div className="help-layout"><aside><span>QUICK MAP</span>{["Getting started","Studies & surveys","Points & reputation","Privacy & access","Login & accounts"].map((item,index)=><button key={item} onClick={()=>setOpen(Math.min(index,questions.length-1))}><b>0{index+1}</b>{item}</button>)}</aside><div className="help-accordion">{questions.map((item,index)=><article className={open===index?"open":""} key={item[0]}><button onClick={()=>setOpen(open===index?-1:index)}><span>{String(index+1).padStart(2,"0")}</span><b>{item[0]}</b><i>{open===index?"−":"+"}</i></button><div><p>{item[1]}</p></div></article>)}</div></div></section>;
}

function MeetUs() {
  const team=[["AW","August Wang","Co-founder · Product & Data","Berkeley researcher and builder focused on applied AI, data products, and founder validation."],["RS","Rudransh Singh","Co-founder · Engineering","Founding engineer experience across fast-moving startup teams and scalable product systems."],["KT","Keira Tan","Co-founder · Community","Connects founder programs, contributors, and campus innovation communities."],["MP","Mira Pande","Co-founder · Strategy","Builds the operating model that turns early validation into repeatable founder value."]];
  return <section className="meet-page"><div className="meet-hero"><span>MEET US</span><h1>Curious people building<br/><em>for curious builders.</em></h1><p>InsightLab began with one frustration: founders spend months polishing solutions before learning whether the problem matters. We are building the infrastructure for that conversation to happen earlier.</p></div>
    <div className="team-section"><div className="team-intro"><span>THE FOUNDING TEAM</span><h2>Different disciplines.<br/>One shared question.</h2><p>How can better evidence help more good ideas survive—and more weak assumptions change before they become expensive?</p></div><div className="team-grid">{team.map((t,i)=><article key={t[1]}><div className={`team-portrait portrait-${i}`}><span>{t[0]}</span><i/><i/></div><span>{String(i+1).padStart(2,"0")}</span><h3>{t[1]}</h3><b>{t[2]}</b><p>{t[3]}</p><button>LinkedIn ↗</button></article>)}</div></div>
    <div className="meet-values"><span>WHAT WE BELIEVE</span><div>{[["Evidence should arrive early","The cheapest time to change direction is before the product hardens."],["Dissent is useful data","A thoughtful objection can be more valuable than a hundred likes."],["AI should organize—not decide","Models surface patterns; founders remain accountable for judgment."],["Opportunity can follow insight","People should be recognized for how well they think, not only how well they résumé."]].map((x,i)=><article key={x[0]}><b>0{i+1}</b><h3>{x[0]}</h3><p>{x[1]}</p></article>)}</div></div>
  </section>
}

function MembershipTerms({role,onClose,onUpgrade}:{role:Role;onClose:()=>void;onUpgrade:()=>void}) {
  return <div className="terms-backdrop"><div className="terms-modal"><button className="modal-close" onClick={onClose} aria-label="Close membership terms">×</button><span>WELCOME TO INSIGHTLAB</span><h2>Your {roleContent[role].label} membership</h2><p>You are entering on the Free membership. These standards keep the network useful for everyone.</p><div className="terms-list"><div><b>01</b><p><strong>Contribute honestly</strong><small>Rewards recognize thoughtful participation, never positive sentiment.</small></p></div><div><b>02</b><p><strong>Protect private research</strong><small>Restricted studies and founder materials cannot be redistributed.</small></p></div><div><b>03</b><p><strong>Expect transparent weighting</strong><small>Low-effort, duplicate, or suspicious responses receive less analytical weight.</small></p></div></div><div className="terms-tier"><span>FREE MEMBER</span><p><b>{role==="founder"?"1 validation / month":role==="contributor"?"Unlimited public contributions":"Public trend summaries"}</b><small>Upgrade any time for advanced tools and private access.</small></p></div><div className="terms-actions"><button className="outline-btn" onClick={onClose}>Continue free</button><button className="primary" onClick={onUpgrade}>View membership options →</button></div></div></div>
}
