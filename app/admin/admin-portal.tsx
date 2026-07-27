"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import Link from "next/link";
import { AdminDashboard, useInterfaceTranslation } from "../insightlab-app";

export default function AdminPortal(){
  const [client,setClient]=useState<SupabaseClient|null>(null);
  const [user,setUser]=useState<User|null>(null);
  const [ready,setReady]=useState(false);
  const [configured,setConfigured]=useState(false);
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [forgotPassword,setForgotPassword]=useState(false);
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [locale,setLocale]=useState<"en"|"zh"|"es">("en");
  useInterfaceTranslation(locale);

  useEffect(()=>{
    let active=true;
    let unsubscribe:(()=>void)|undefined;
    fetch("/api/auth/config")
      .then(response=>response.json())
      .then((config:{configured:boolean;url:string|null;publishableKey:string|null})=>{
        if(!active)return;
        if(!config.configured||!config.url||!config.publishableKey){
          setReady(true);
          return;
        }
        const next=createClient(config.url,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
        setClient(next);
        setConfigured(true);
        next.auth.getSession().then(({data})=>{
          if(active){setUser(data.session?.user??null);setReady(true);}
        });
        const listener=next.auth.onAuthStateChange((_event,session)=>{
          if(active)setUser(session?.user??null);
        });
        unsubscribe=()=>listener.data.subscription.unsubscribe();
      })
      .catch(()=>{if(active)setReady(true);});
    return()=>{active=false;unsubscribe?.();};
  },[]);

  const apiFetch=useCallback(async(input:RequestInfo|URL,init:RequestInit={})=>{
    const session=client?await client.auth.getSession():null;
    const headers=new Headers(init.headers);
    const token=session?.data.session?.access_token;
    if(token)headers.set("authorization",`Bearer ${token}`);
    return fetch(input,{...init,headers});
  },[client]);

  const google=async()=>{
    if(!client)return;
    setBusy(true);setError("");
    const result=await client.auth.signInWithOAuth({provider:"google",options:{redirectTo:`${window.location.origin}/admin`}});
    if(result.error){setError(result.error.message);setBusy(false);}
  };
  const emailPasswordSignIn=async()=>{
    if(!client||!email.trim()||password.length<8)return;
    setBusy(true);setError("");
    const result=await client.auth.signInWithPassword({email:email.trim(),password});
    setBusy(false);
    if(result.error)setError(result.error.message);
  };
  const sendReset=async()=>{
    if(!client||!email.trim())return;
    setBusy(true);setError("");setNotice("");
    const result=await client.auth.resetPasswordForEmail(email.trim(),{redirectTo:`${window.location.origin}/?reset=1`});
    setBusy(false);
    if(result.error)setError(result.error.message);
    else setNotice("Password reset email sent. Use its secure link to choose a new password.");
  };
  const signOut=async()=>{
    await client?.auth.signOut();
    setUser(null);setPassword("");setForgotPassword(false);
  };
  const languageControl=<div className="admin-language admin-language-floating">{(["en","zh","es"] as const).map(item=><button className={locale===item?"active":""} key={item} onClick={()=>setLocale(item)}>{item==="zh"?"中文":item.toUpperCase()}</button>)}</div>;

  if(!ready)return <main className="admin-gateway">{languageControl}<div className="admin-gateway-loader"><i/><span>Opening secure owner console…</span></div></main>;

  if(!configured)return <main className="admin-gateway">
    {languageControl}
    <div className="admin-gateway-brand">Insight<span>Lab</span><small>OWNER CONSOLE</small></div>
    <section><span>AUTHENTICATION REQUIRED</span><h1>The control room<br/><em>is not connected yet.</em></h1><p>Connect the project’s Supabase public configuration before this private route can verify the owner account.</p><Link href="/">← Return to InsightLab</Link></section>
  </main>;

  if(!user)return <main className="admin-gateway">
    {languageControl}
    <div className="admin-gateway-brand">Insight<span>Lab</span><small>OWNER CONSOLE</small></div>
    <section className="admin-login-card"><span>SEPARATE ADMIN ACCESS</span><h1>Verify the owner<br/><em>before entering.</em></h1><p>This route is separate from the public website and does not appear in its navigation.</p>
      <button className="admin-google" onClick={google} disabled={busy}><b>G</b> Continue with Google</button>
      <div className="admin-login-divider"><i/><span>or use owner email and password</span><i/></div>
      <label>Owner email<input type="email" value={email} onChange={event=>setEmail(event.target.value)} placeholder="owner@example.com"/></label>
      {!forgotPassword&&<label>Password<input type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} placeholder="At least 8 characters"/></label>}
      {error&&<div className="admin-login-error">{error}</div>}
      {notice&&<div className="auth-notice">{notice}</div>}
      <button className="admin-login-submit" disabled={busy||!email.trim()||(!forgotPassword&&password.length<8)} onClick={forgotPassword?sendReset:emailPasswordSignIn}>{busy?"Please wait…":forgotPassword?"Send password reset email →":"Sign in to console →"}</button>
      <button className="resend-code" onClick={()=>{setForgotPassword(value=>!value);setError("");setNotice("");}} disabled={busy}>{forgotPassword?"← Back to sign in":"Forgot password?"}</button>
      <Link href="/">← Return to public website</Link>
    </section>
  </main>;

  return <main className="standalone-admin">
    <header><Link href="/" className="admin-header-brand">Insight<span>Lab</span><small>OWNER CONSOLE</small></Link><div className="admin-language">{(["en","zh","es"] as const).map(item=><button className={locale===item?"active":""} key={item} onClick={()=>setLocale(item)}>{item==="zh"?"中文":item.toUpperCase()}</button>)}</div><div><span><i/>SECURE SESSION</span><b>{user.email}</b><button onClick={signOut}>Sign out</button></div></header>
    <AdminDashboard apiFetch={apiFetch} locale={locale}/>
  </main>;
}
