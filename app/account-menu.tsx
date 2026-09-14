"use client";

import { useEffect, useRef } from "react";
import { InsightBrandMark } from "./insight-agent";

type AccountLocale = "en" | "zh" | "es";

const accountCopy = {
  en: {
    account: "YOUR ACCOUNT",
    verified: "Verified email",
    profile: "View profile",
    switch: "Switch account",
    signOut: "Sign out",
    close: "Close account menu",
  },
  zh: {
    account: "你的账户",
    verified: "邮箱已验证",
    profile: "查看个人主页",
    switch: "切换账户",
    signOut: "退出登录",
    close: "关闭账户菜单",
  },
  es: {
    account: "TU CUENTA",
    verified: "Correo verificado",
    profile: "Ver perfil",
    switch: "Cambiar de cuenta",
    signOut: "Cerrar sesión",
    close: "Cerrar menú de cuenta",
  },
} satisfies Record<AccountLocale, Record<string, string>>;

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join("").toUpperCase();
}

function localizedRole(role: string, locale: AccountLocale) {
  if (locale === "zh") return role === "founder" ? "创业者" : role === "contributor" ? "贡献者" : role === "investor" ? "投资人" : role;
  if (locale === "es") return role === "founder" ? "Fundador" : role === "contributor" ? "Colaborador" : role === "investor" ? "Inversor" : role;
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function AccountMenu({
  open,
  name,
  email,
  role,
  avatarUrl,
  locale,
  onProfile,
  onSwitch,
  onSignOut,
  onClose,
}: {
  open: boolean;
  name: string;
  email: string;
  role: string;
  avatarUrl: string;
  locale: AccountLocale;
  onProfile: () => void;
  onSwitch: () => void;
  onSignOut: () => void;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const text = accountCopy[locale];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;
  return <div className="account-popover" ref={rootRef} role="dialog" aria-label={text.account}>
    <header>
      <InsightBrandMark/>
      <span>{text.account}</span>
      <button onClick={onClose} aria-label={text.close}>×</button>
    </header>
    <section className="account-popover-person">
      <div className="account-popover-avatar" style={avatarUrl ? {backgroundImage: `url("${avatarUrl}")`} : undefined}>
        {!avatarUrl && initials(name)}
      </div>
      <div><b>{name}</b><span>{localizedRole(role, locale)}</span><small><i/> {text.verified}</small></div>
    </section>
    <p>{email}</p>
    <nav>
      <button onClick={onProfile}><span>01</span>{text.profile}<b>→</b></button>
      <button onClick={onSwitch}><span>02</span>{text.switch}<b>↗</b></button>
      <button className="danger" onClick={onSignOut}><span>03</span>{text.signOut}<b>⏻</b></button>
    </nav>
  </div>;
}

export function FooterAccountCard({
  name,
  email,
  role,
  avatarUrl,
  locale,
  onProfile,
  onSwitch,
  onSignOut,
}: {
  name: string;
  email: string;
  role: string;
  avatarUrl: string;
  locale: AccountLocale;
  onProfile: () => void;
  onSwitch: () => void;
  onSignOut: () => void;
}) {
  const text = accountCopy[locale];
  return <section className="footer-account-card">
    <div className="footer-account-avatar" style={avatarUrl ? {backgroundImage: `url("${avatarUrl}")`} : undefined}>
      {!avatarUrl && initials(name)}
    </div>
    <div><span>{localizedRole(role, locale)}</span><b>{name}</b><small>{email}</small></div>
    <button onClick={onProfile}>{text.profile}</button>
    <button onClick={onSwitch}>{text.switch}</button>
    <button className="footer-signout" onClick={onSignOut}>{text.signOut} <i>⏻</i></button>
  </section>;
}
