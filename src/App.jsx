import { useEffect, useMemo, useState } from "react";
import { hourKey, supabase } from "./supabase.js";

function prettyHour(key) {
  if (!key) return "";
  const [date, h] = key.split("T");
  return `${date} · ${h}:00 UTC`;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [hours, setHours] = useState([]);
  const [bones, setBones] = useState([]);
  const [mine, setMine] = useState([]);
  const [authOpen, setAuthOpen] = useState(false);
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [handle, setHandle] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const nowKey = useMemo(() => hourKey(), []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    loadPublic();
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      setMine([]);
      return;
    }
    loadMe(session.user.id);
  }, [session]);

  async function loadPublic() {
    const { data: h } = await supabase.from("marrow_hours").select("*").order("created_at", { ascending: false }).limit(24);
    setHours(h || []);
    const { data: b } = await supabase.from("marrow_bones").select("id,title,body,created_at,author_id,is_public").eq("is_public", true).order("created_at", { ascending: false }).limit(40);
    setBones(b || []);
  }

  async function loadMe(uid) {
    const { data: p } = await supabase.from("marrow_profiles").select("*").eq("id", uid).maybeSingle();
    setProfile(p);
    const { data: b } = await supabase.from("marrow_bones").select("*").eq("author_id", uid).order("created_at", { ascending: false });
    setMine(b || []);
  }

  async function submitAuth(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.user) {
          const h = (handle || email.split("@")[0]).toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24) || "reader";
          await supabase.from("marrow_profiles").insert({ id: data.user.id, handle: h, display_name: handle || h });
        }
      }
      setAuthOpen(false);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveBone(e) {
    e.preventDefault();
    if (!session?.user) {
      setAuthOpen(true);
      return;
    }
    setErr("");
    setBusy(true);
    try {
      if (!profile) {
        const h = session.user.email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);
        await supabase.from("marrow_profiles").upsert({ id: session.user.id, handle: h, display_name: h });
      }
      const { error } = await supabase.from("marrow_bones").insert({
        author_id: session.user.id,
        title: title.trim(),
        body: body.trim(),
        is_public: isPublic,
      });
      if (error) throw error;
      setTitle("");
      setBody("");
      await loadPublic();
      await loadMe(session.user.id);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  async function togglePublic(bone) {
    await supabase.from("marrow_bones").update({ is_public: !bone.is_public }).eq("id", bone.id);
    await loadPublic();
    await loadMe(session.user.id);
  }

  const current = hours.find((h) => h.hour_key === nowKey) || hours[0];

  return (
    <>
      <div className="grain" />
      <div className="wrap">
        <header className="top">
          <div className="brand">
            <small>independent desk · hourly</small>
            Marrow
          </div>
          <nav className="auth">
            {session ? (
              <>
                <span>{profile?.handle ? `@${profile.handle}` : session.user.email}</span>
                <button className="ghost" onClick={() => supabase.auth.signOut()}>sign out</button>
              </>
            ) : (
              <button onClick={() => setAuthOpen(true)}>sign in</button>
            )}
          </nav>
        </header>
        <section className="hero">
          <div className="kicker">{prettyHour(current?.hour_key || nowKey)}</div>
          <h1>{current?.headline || "The desk is open."}</h1>
          <p>{current?.blurb || "A new copy lands every hour. Public bones go on the wall."}</p>
        </section>
        <div className="grid">
          <div>
            <div className="panel">
              <h2>The wall</h2>
              {bones.length === 0 && <p className="meta">Nothing public yet. Be the first.</p>}
              {bones.map((b) => (
                <article className="bone" key={b.id}>
                  <h3>{b.title}</h3>
                  <div className="meta">{new Date(b.created_at).toLocaleString()}</div>
                  <p>{b.body}</p>
                </article>
              ))}
            </div>
            <div className="panel" style={{ marginTop: 20 }}>
              <h2>Write a bone</h2>
              <form className="stack" onSubmit={saveBone}>
                <input required maxLength={140} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
                <textarea required maxLength={8000} placeholder="The piece itself." value={body} onChange={(e) => setBody(e.target.value)} />
                <label className="check">
                  <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
                  Mark public — it appears on the wall
                </label>
                {err && <div className="err">{err}</div>}
                <button disabled={busy}>{busy ? "saving…" : "save to the desk"}</button>
              </form>
              {mine.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <div className="meta">your drawer</div>
                  {mine.map((b) => (
                    <article className="bone" key={b.id}>
                      <h3>{b.title}</h3>
                      <div className="meta">{b.is_public ? "public" : "private"} · {new Date(b.created_at).toLocaleString()}</div>
                      <p>{b.body}</p>
                      <button className="ghost" style={{ marginTop: 8 }} onClick={() => togglePublic(b)}>
                        {b.is_public ? "make private" : "make public"}
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
          <aside>
            <div className="panel">
              <h2>Hourly editions</h2>
              <ul className="hours">
                {hours.map((h) => (
                  <li key={h.hour_key}>
                    <div className="kicker">{prettyHour(h.hour_key)}</div>
                    <strong>{h.headline}</strong>
                    <p>{h.blurb}</p>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </div>
      {authOpen && (
        <div className="modal" onClick={() => setAuthOpen(false)}>
          <div className="card" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontFamily: "Fraunces, serif", marginBottom: 12 }}>{mode === "signin" ? "Come back in" : "Take a seat"}</h2>
            <form className="stack" onSubmit={submitAuth}>
              <input type="email" required placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input type="password" required minLength={6} placeholder="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              {mode === "signup" && (<input placeholder="handle" value={handle} onChange={(e) => setHandle(e.target.value)} />)}
              {err && <div className="err">{err}</div>}
              <button disabled={busy}>{busy ? "working…" : mode === "signin" ? "sign in" : "create account"}</button>
              <button type="button" className="ghost" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setErr(""); }}>
                {mode === "signin" ? "need an account?" : "already have one?"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
