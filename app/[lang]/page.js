'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { translations } from '@/lib/translations';
import { useCloneStatus } from '@/lib/context/CloneStatusContext';

export default function Home() {
  const params = useParams();
  const router = useRouter();
  const lang = params?.lang || 'tr';
  const t = translations[lang] || translations.tr;

  const [formData, setFormData] = useState({
    userToken: '',
    sourceGuildId: '',
    targetGuildId: '',
    password: process.env.NEXT_PUBLIC_API_PASSWORD || '',
    resetTargetServer: true,
    rateLimitDelay: 1000
  });

  const [cloneOptions, setCloneOptions] = useState({
    cloneRoles: true,
    cloneChannels: true,
    cloneEmojis: true,
    cloneServerIcon: true,
    cloneServerBanner: true,
    cloneServerName: true
  });
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [fastMode, setFastMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [status, setStatus] = useState(null);
  const [serverInfo, setServerInfo] = useState(null);
  const [logs, setLogs] = useState([]);
  const [showToken, setShowToken] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [rateLimitInfo, setRateLimitInfo] = useState(null);
  const logRef = useRef(null);
  const abortControllerRef = useRef(null);
  const { setIsCloning } = useCloneStatus();

  // Global context'e loading durumunu yansıt — HeaderIsland bunu okuyup
  // dil değiştirme/logo tıklama gibi navigasyonları engelleyecek.
  useEffect(() => {
    setIsCloning(loading);
  }, [loading, setIsCloning]);

  // Sayfa/işlem devam ederken kullanıcı sekmeyi kapatmaya veya
  // yenilemeye çalışırsa uyarı göster — kaza ile klonlamayı yarıda kesmesin.
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (loading) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [loading]);

  const fetchInfo = async () => {
    if (!formData.userToken || !formData.sourceGuildId || !formData.targetGuildId) return;
    try {
      const response = await fetch('/api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, lang }),
      });
      const data = await response.json();
      if (response.ok && !data.error) {
        setServerInfo(data);
      }
    } catch (err) {
      setServerInfo(null);
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus(null);
    setIsValidating(true); // Always show validating on button click

    // 1. MANDATORY VALIDATION ON CLICK
    try {
      const valRes = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, lang }),
      });
      const valData = await valRes.json();

      if (!valRes.ok) {
        if (valData.error === 'TOKEN_INVALID') throw new Error(t.errorInvalidToken);
        if (valData.error === 'NO_ADMIN') throw new Error(t.errorNoAdmin);
        if (valData.error === 'GUILD_NOT_FOUND') throw new Error(t.error);
        throw new Error(valData.error || t.error);
      }

      if (valData.userId) {
        setCurrentUserId(valData.userId);
        // Kalan hakkı sorgula (sadece görüntüleme amaçlı, gerçek limit /api/clone içinde kontrol edilir)
        try {
          const rlRes = await fetch('/api/ratelimit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: valData.userId, password: formData.password })
          });
          if (rlRes.ok) {
            const rlData = await rlRes.json();
            setRateLimitInfo(rlData);
          }
        } catch (e) { /* sessizce geç, kritik değil */ }
      }
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
      setIsValidating(false);
      return; // STOP HERE if validation fails
    }

    setIsValidating(false);
    await fetchInfo(); // Fetch info for display before starting clone

    // 2. START CLONING
    setLoading(true);
    setLogs([]);
    setStatus({ type: 'info', message: t.cloningStarted });

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch('/api/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, lang, cloneOptions }),
        signal: abortController.signal
      });

      if (!response.ok) {
        const data = await response.json();
        if (data.error === 'OVERLOAD') throw new Error(t.systemOverload);
        if (data.error === 'TIMEOUT') throw new Error(t.timeoutError);
        throw new Error(data.error || t.error);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          setStatus(prev => (prev && prev.type === 'error') ? prev : { type: 'success', message: t.success });
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.replace('data: ', ''));
            if (data.message === 'DONE') {
              setStatus({ type: 'success', message: t.success });
            } else if (data.error === 'RATE_LIMITED') {
              const resetDate = data.resetAt ? new Date(data.resetAt) : null;
              const timeStr = resetDate
                ? resetDate.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })
                : '';
              const msg = t.errorRateLimit + (timeStr ? ` (${t.rateLimitResetAt || 'Sıfırlanma'}: ${timeStr})` : '');
              setStatus({ type: 'error', message: msg });
              setRateLimitInfo({ resetAt: data.resetAt });
            } else if (data.error === 'ABORTED') {
              setStatus({ type: 'error', message: t.errorAborted || 'İşlem iptal edildi.' });
            } else if (data.error) {
              setStatus({ type: 'error', message: data.error });
            } else {
              setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), text: data.message }]);
            }
          }
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        setStatus({ type: 'error', message: t.errorAborted || 'İşlem iptal edildi.' });
      } else {
        setStatus({ type: 'error', message: error.message || t.connectionError });
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    // CRITICAL: If inputs change, reset serverInfo to force re-validation on next submit
    setServerInfo(null);
    setStatus(null);
  };

  const handleOptionChange = (key) => {
    setCloneOptions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <main>

      <div className="container">
        <header>
          <h1>{t.title}</h1>
          <p className="subtitle">{t.subtitle}</p>
        </header>

        {/* PREVIEW CARDS (Visible whenever serverInfo exists) */}
        {serverInfo && (
          <div className="info-section">
            <div className="info-row">
              <div className="info-card user">
                <img src={serverInfo.user.avatar} alt="Avatar" />
                <div className="details">
                  <span className="val">{serverInfo.user.username}</span>
                  <span className="label">{t.connectedAccount}</span>
                </div>
              </div>
            </div>
            {serverInfo.source && (
              <div className="info-row">
                <div className="info-card server">
                  <img src={serverInfo.source.icon || 'https://via.placeholder.com/40'} alt="Source" />
                  <div className="details">
                    <span className="val">{serverInfo.source.name}</span>
                    <span className="meta">{serverInfo.source.channels} {t.channels} • {serverInfo.source.roles} {t.roles} • {serverInfo.source.memberCount} {t.members}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {loading || logs.length > 0 ? (
          <div className="clone-view">
            <div className="section-title-row">
              <div className="section-title">{t.liveLogs}</div>
              {loading && (
                <div className="live-indicator">
                  <span className="live-dot"></span>
                  {t.cloningInProgress || 'İşlem devam ediyor'}
                </div>
              )}
            </div>
            <div className="live-log" ref={logs.length > 0 ? (e => { if (e) e.scrollTop = e.scrollHeight }) : null}>
              {logs.length === 0 && loading && (
                <div className="log-entry active">
                  <span className="text">&gt; {t.cloningStarted}</span>
                </div>
              )}
              {logs.map((log, i) => (
                <div key={i} className={`log-entry ${i === logs.length - 1 ? 'active' : ''}`}>
                  <span className="timestamp">[{log.time}]</span>
                  <span className="text">&gt; {log.text}</span>
                </div>
              ))}
            </div>
            {status && <div className={`status-message status-${status.type}`}>{status.message}</div>}

            <div className="clone-view-actions">
              {loading && (
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={handleCancel}
                >
                  {t.cancelOperation || 'İşlemi İptal Et'}
                </button>
              )}
              {!loading && (
                <button
                  className="back-btn"
                  onClick={() => {
                    setLoading(false);
                    setLogs([]);
                    setStatus(null);
                    setServerInfo(null);
                  }}
                >
                  {t.goBack}
                </button>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group full-width">
                <label>{t.userToken}</label>
                <div className="input-wrapper">
                  <input
                    type={showToken ? 'text' : 'password'}
                    name="userToken"
                    placeholder={t.mfaTokenPlaceholder}
                    value={formData.userToken}
                    onChange={handleChange}
                    required
                  />
                  <button
                    type="button"
                    className="toggle-visibility"
                    onClick={() => setShowToken(!showToken)}
                  >
                    {showToken ? (
                      <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    )}
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label>{t.sourceGuildId}</label>
                <input type="text" name="sourceGuildId" placeholder={t.sourcePlaceholder} value={formData.sourceGuildId} onChange={handleChange} required />
              </div>
              <div className="form-group">
                <label>{t.targetGuildId}</label>
                <input type="text" name="targetGuildId" placeholder={t.targetPlaceholder} value={formData.targetGuildId} onChange={handleChange} required />
              </div>
              <div className="checkbox-group">
                <input type="checkbox" id="resetTargetServer" name="resetTargetServer" checked={formData.resetTargetServer} onChange={handleChange} />
                <label htmlFor="resetTargetServer" style={{ color: formData.resetTargetServer ? '#ffffff' : 'var(--accent)' }}>
                  {t.resetTargetServer}
                </label>
              </div>

              <div className="checkbox-group">
                <input
                  type="checkbox"
                  id="fastMode"
                  checked={fastMode}
                  onChange={(e) => {
                    const isFast = e.target.checked;
                    setFastMode(isFast);
                    setFormData(prev => ({ ...prev, rateLimitDelay: isFast ? 500 : 1000 }));
                  }}
                />
                <label htmlFor="fastMode" style={{ color: fastMode ? '#ffffff' : 'var(--accent)' }}>
                  {t.fastMode}
                </label>
              </div>

              {fastMode && (
                <div className="fast-mode-warn">
                  ⚠️ {t.fastModeWarn}
                </div>
              )}

              <div className="advanced-toggle-row">
                <button
                  type="button"
                  className="advanced-toggle"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                >
                  <span className={`advanced-arrow ${showAdvanced ? 'open' : ''}`}>▸</span>
                  {t.advancedSettings || 'Gelişmiş Ayarlar'}
                </button>
              </div>

              {showAdvanced && (
                <div className="advanced-options">
                  <div className="advanced-option-item">
                    <input
                      type="checkbox"
                      id="cloneRoles"
                      checked={cloneOptions.cloneRoles}
                      onChange={() => handleOptionChange('cloneRoles')}
                    />
                    <label htmlFor="cloneRoles">{t.optRoles || 'Rolleri Kopyala'}</label>
                  </div>
                  <div className="advanced-option-item">
                    <input
                      type="checkbox"
                      id="cloneChannels"
                      checked={cloneOptions.cloneChannels}
                      onChange={() => handleOptionChange('cloneChannels')}
                    />
                    <label htmlFor="cloneChannels">{t.optChannels || 'Kanalları Kopyala'}</label>
                  </div>
                  <div className="advanced-option-item">
                    <input
                      type="checkbox"
                      id="cloneEmojis"
                      checked={cloneOptions.cloneEmojis}
                      onChange={() => handleOptionChange('cloneEmojis')}
                    />
                    <label htmlFor="cloneEmojis">{t.optEmojis || 'Emojileri Kopyala'}</label>
                  </div>
                  <div className="advanced-option-item">
                    <input
                      type="checkbox"
                      id="cloneServerName"
                      checked={cloneOptions.cloneServerName}
                      onChange={() => handleOptionChange('cloneServerName')}
                    />
                    <label htmlFor="cloneServerName">{t.optServerName || 'Sunucu İsmini Kopyala'}</label>
                  </div>
                  <div className="advanced-option-item">
                    <input
                      type="checkbox"
                      id="cloneServerIcon"
                      checked={cloneOptions.cloneServerIcon}
                      onChange={() => handleOptionChange('cloneServerIcon')}
                    />
                    <label htmlFor="cloneServerIcon">{t.optServerIcon || 'Sunucu İkonunu Kopyala'}</label>
                  </div>
                  <div className="advanced-option-item">
                    <input
                      type="checkbox"
                      id="cloneServerBanner"
                      checked={cloneOptions.cloneServerBanner}
                      onChange={() => handleOptionChange('cloneServerBanner')}
                    />
                    <label htmlFor="cloneServerBanner">{t.optServerBanner || 'Sunucu Bannerını Kopyala'}</label>
                  </div>
                </div>
              )}

              {rateLimitInfo && typeof rateLimitInfo.remaining === 'number' && (
                <div className="rate-limit-badge">
                  <span>{t.rateLimitRemaining || 'Kalan hak'}:</span>
                  <div className="rate-limit-dots">
                    {Array.from({ length: rateLimitInfo.limit || 5 }).map((_, i) => (
                      <span
                        key={i}
                        className={`rate-limit-dot ${i < rateLimitInfo.remaining ? 'filled' : ''}`}
                      />
                    ))}
                  </div>
                  <span>{rateLimitInfo.remaining}/{rateLimitInfo.limit || 5}</span>
                </div>
              )}
              <div className="actions">
                <button type="submit" disabled={isValidating || loading}>
                  <div className="btn-content">
                    {(isValidating || loading) && <div className="spinner"></div>}
                    <span>{isValidating ? (lang === 'tr' ? 'Kontrol Ediliyor...' : 'Validating...') : t.startClone}</span>
                  </div>
                </button>
              </div>
            </div>
            {status && <div className={`status-message status-${status.type}`}>{status.message}</div>}
          </form>
        )}
      </div>

      <footer>
        <div className="footer-links">
          {loading ? (
            <>
              <span className="footer-link-disabled">{t.navAbout}</span>
              <span className="footer-link-disabled">{t.navGuides}</span>
              <span className="footer-link-disabled">{t.navPrivacy}</span>
              <span className="footer-link-disabled">{t.navTerms}</span>
              <span className="footer-link-disabled">{t.navContact}</span>
            </>
          ) : (
            <>
              <Link href={`/${lang}/about`}>{t.navAbout}</Link>
              <Link href={`/${lang}/guides`}>{t.navGuides}</Link>
              <Link href={`/${lang}/privacy`}>{t.navPrivacy}</Link>
              <Link href={`/${lang}/terms`}>{t.navTerms}</Link>
              <Link href={`/${lang}/contact`}>{t.navContact}</Link>
            </>
          )}
        </div>
        <div className="copyright">{t.footer}</div>
      </footer>
    </main>
  );
}
