import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useUser } from './UserContext.js';

export default function SoloChat() {
  const currentUser = useUser();   // <-- get logged‑in user
  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem('cp-terminal-history');
    return saved ? JSON.parse(saved) : [
      { type: 'response', text: 'Welcome to CP Terminal.\nType "help" to get started.' }
    ];
  });
  const [input, setInput] = useState('');
  const [commandHistory, setCommandHistory] = useState(() => {
    const saved = localStorage.getItem('cp-command-history');
    return saved ? JSON.parse(saved) : [];
  });
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [aliases, setAliases] = useState(() => {
    const saved = localStorage.getItem('cp-aliases');
    return saved ? JSON.parse(saved) : {};
  });
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const outputRef = useRef(null);
  const inputRef = useRef(null);

  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);

  const allCommands = [
    'help', 'clear', 'time', 'date', 'echo', 'whoami', 'version', 'calc',
    'weather', 'define', 'crypto', 'joke', 'news', 'qr', 'ip', 'fact',
    'randomuser', 'timezone', 'alias', 'unalias', 'aliases', 'quote',
    ...Object.keys(aliases)
  ];

  // The user‑friendly name shown in the prompt
  const userName = currentUser?.displayName || currentUser?.email || 'guest';

  // Persist history
  useEffect(() => {
    localStorage.setItem('cp-terminal-history', JSON.stringify(history.slice(-100)));
  }, [history]);

  useEffect(() => {
    localStorage.setItem('cp-command-history', JSON.stringify(commandHistory.slice(-100)));
  }, [commandHistory]);

  useEffect(() => {
    localStorage.setItem('cp-aliases', JSON.stringify(aliases));
  }, [aliases]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [history]);

  const focusInput = () => {
    if (inputRef.current) inputRef.current.focus();
  };

  const fetchWithTimeout = (url, timeout = 5000) => {
    return Promise.race([
      fetch(url),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), timeout))
    ]);
  };

  // Format response text with a timestamp
  const formatResponse = (text) => {
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${text}\n⏱ ${now}`;
  };

  const executeCommand = useCallback(async (cmd) => {
    const trimmedCmd = cmd.trim();
    if (!trimmedCmd) return;

    const newHistory = [...history, { type: 'command', text: '→ ' + trimmedCmd }];
    setCommandHistory(prev => [...prev, trimmedCmd]);
    setHistoryIndex(-1);
    setSuggestions([]);

    let parts = trimmedCmd.split(/\s+/);
    let mainCmd = parts[0].toLowerCase();

    if (aliases[mainCmd]) {
      const expansion = aliases[mainCmd].split(/\s+/);
      mainCmd = expansion[0].toLowerCase();
      parts = expansion.concat(parts.slice(1));
    }
    const args = parts.slice(1);

    if (mainCmd === 'clear') {
      if (history.length > 2) {
        setShowClearConfirm(true);
        return;
      }
      setHistory([]);
      setInput('');
      setShowClearConfirm(false);
      return;
    }

    if (showClearConfirm) setShowClearConfirm(false);

    // Cloud commands
    const cloudCmds = ['weather','define','crypto','joke','news','qr','ip','fact','randomuser','timezone'];
    if (cloudCmds.includes(mainCmd)) {
      setLoading(true);
      setHistory([...newHistory, { type: 'response', text: '⏳ Fetching...' }]);
      setInput('');
      try {
        let result = '';
        switch (mainCmd) {
          case 'weather':
            if (!args[0]) result = 'Usage: weather <city>';
            else {
              const city = args.join(' ');
              const res = await fetchWithTimeout(`https://wttr.in/${encodeURIComponent(city)}?format=%C+%t+%w`);
              if (!res.ok) throw new Error('City not found');
              result = `🌤 ${city}: ${(await res.text()).trim()}`;
            }
            break;
          case 'define':
            if (!args[0]) result = 'Usage: define <word>';
            else {
              const res = await fetchWithTimeout(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(args[0])}`);
              if (!res.ok) throw new Error('Word not found');
              const data = await res.json();
              const e = data[0];
              let defs = '';
              e.meanings.slice(0,2).forEach(m => {
                defs += `  ${m.partOfSpeech}: ${m.definitions[0].definition}\n`;
              });
              result = `📚 ${e.word}\n${defs.trim()}`;
            }
            break;
          case 'crypto':
            if (!args[0]) result = 'Usage: crypto <coin_id>';
            else {
              const res = await fetchWithTimeout(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(args[0])}&vs_currencies=usd`);
              if (!res.ok) throw new Error('Coin not found');
              const data = await res.json();
              if (!data[args[0]]) throw new Error('Coin not found');
              result = `💰 ${args[0].toUpperCase()}: $${data[args[0]].usd}`;
            }
            break;
          case 'joke':
            {
              const res = await fetchWithTimeout('https://official-joke-api.appspot.com/random_joke');
              if (!res.ok) throw new Error('Joke fetch failed');
              const d = await res.json();
              result = `😂 ${d.setup}\n   ${d.punchline}`;
            }
            break;
          case 'news':
            try {
              const res = await fetchWithTimeout('https://feeds.npr.org/1001/rss.xml');
              const text = await res.text();
              const items = text.match(/<title>(?!NPR Topics:)([^<]+)<\/title>/g);
              if (items && items.length > 0) {
                result = '📰 Latest from NPR:\n';
                items.slice(0,5).forEach((t,i) => result += `${i+1}. ${t.replace(/<[^>]+>/g,'')}\n`);
              } else result = 'No news found.';
            } catch { result = 'News feed unavailable.'; }
            break;
          case 'qr':
            if (!args[0]) result = 'Usage: qr <text or url>';
            else result = `📱 QR: https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(args.join(' '))}`;
            break;
          case 'ip':
            {
              const res = await fetchWithTimeout('https://api.ipify.org?format=json');
              const data = await res.json();
              result = `🌐 Your IP: ${data.ip}`;
            }
            break;
          case 'fact':
            {
              const res = await fetchWithTimeout('https://uselessfacts.jsph.pl/random.json?language=en');
              const data = await res.json();
              result = `💡 ${data.text}`;
            }
            break;
          case 'randomuser':
            {
              const res = await fetchWithTimeout('https://randomuser.me/api/');
              const data = await res.json();
              const u = data.results[0];
              result = `👤 ${u.name.first} ${u.name.last}\n   ${u.email}`;
            }
            break;
          case 'timezone':
            if (!args[0]) result = 'Usage: timezone <area>/<city>';
            else {
              const res = await fetchWithTimeout(`https://worldtimeapi.org/api/timezone/${encodeURIComponent(args[0])}`);
              if (!res.ok) throw new Error('Invalid timezone');
              const data = await res.json();
              result = `🕒 ${data.timezone}: ${data.datetime.split('T')[1].split('.')[0]}`;
            }
            break;
        }
        setHistory(prev => [...prev.slice(0,-1), { type: 'response', text: formatResponse(result) }]);
      } catch (err) {
        setHistory(prev => [...prev.slice(0,-1), { type: 'error', text: formatResponse('Error: ' + err.message) }]);
      }
      setLoading(false);
      return;
    }

    // Local commands
    let response = '';
    let isError = false;
    switch (mainCmd) {
      case 'help':
        response = `📋 Available Commands\n\n` +
          `🔹 General:\n  help, clear, time, date, echo, whoami, version\n\n` +
          `🔹 Internet:\n  weather <city>, define <word>, crypto <coin>, joke, news, qr <text>, ip\n` +
          `🔹 Fun:\n  fact, randomuser, quote\n` +
          `🔹 Math:\n  calc <expr>\n` +
          `🔹 Time:\n  timezone <area/city>\n\n` +
          `🔧 Aliases:\n  alias <short> <command> – set\n  unalias <short> – remove\n  aliases – list\n\n` +
          `⌨️  Use Tab for autocomplete, ↑/↓ for history.`;
        break;
      case 'time':
        response = new Date().toLocaleTimeString();
        break;
      case 'date':
        response = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        break;
      case 'echo':
        response = args.join(' ');
        break;
      case 'whoami':
        response = userName;
        break;
      case 'version':
        response = 'CP Terminal v2.1 – Enhanced Edition';
        break;
      case 'calc':
        try {
          const expr = args.join('');
          if (!expr) throw new Error('No expression');
          const sanitized = expr.replace(/[^0-9+\-*/().%\s]/g, '');
          if (sanitized !== expr.replace(/\s/g, '')) throw new Error('Invalid characters');
          response = String(Function('"use strict"; return (' + sanitized + ')')());
        } catch (e) {
          response = 'Error: Invalid expression';
          isError = true;
        }
        break;
      case 'quote':
        response = '"The only way to do great work is to love what you do." – Steve Jobs';
        break;
      case 'alias':
        if (args.length < 2) response = 'Usage: alias <short> <command>';
        else {
          const short = args[0];
          const full = args.slice(1).join(' ');
          setAliases(prev => ({ ...prev, [short]: full }));
          response = `Alias set: ${short} → ${full}`;
        }
        break;
      case 'unalias':
        if (!args[0]) response = 'Usage: unalias <short>';
        else {
          const short = args[0];
          setAliases(prev => { const n = {...prev}; delete n[short]; return n; });
          response = `Alias removed: ${short}`;
        }
        break;
      case 'aliases':
        if (Object.keys(aliases).length === 0) response = 'No aliases set.';
        else response = 'Aliases:\n' + Object.entries(aliases).map(([k,v]) => `  ${k} → ${v}`).join('\n');
        break;
      default:
        response = `Command not found: ${mainCmd}. Type "help".`;
        isError = true;
    }

    const entry = { type: isError ? 'error' : 'response', text: formatResponse(response) };
    setHistory([...newHistory, entry]);
    setInput('');
  }, [history, aliases, showClearConfirm, userName]);

  const confirmClear = (confirmed) => {
    if (confirmed) {
      setHistory([]);
      setInput('');
    }
    setShowClearConfirm(false);
  };

  const complete = () => {
    const parts = input.trim().split(/\s+/);
    const partial = parts[0].toLowerCase();
    const matches = allCommands.filter(cmd => cmd.startsWith(partial));
    if (matches.length === 1) {
      setInput(matches[0] + ' ');
      setSuggestions([]);
    } else if (matches.length > 1) {
      setSuggestions(matches);
      setSelectedSuggestion(0);
    }
  };

  const handleSend = () => {
    if (input.trim()) executeCommand(input);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      complete();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (suggestions.length > 0) {
        setSelectedSuggestion(prev => (prev <= 0 ? suggestions.length - 1 : prev - 1));
      } else {
        const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        if (commandHistory[newIndex]) setInput(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (suggestions.length > 0) {
        setSelectedSuggestion(prev => (prev >= suggestions.length - 1 ? 0 : prev + 1));
      } else {
        const newIndex = historyIndex + 1;
        if (newIndex < commandHistory.length) {
          setHistoryIndex(newIndex);
          setInput(commandHistory[newIndex]);
        } else {
          setHistoryIndex(-1);
          setInput('');
        }
      }
    } else if (e.key === 'Enter') {
      if (suggestions.length > 0 && selectedSuggestion >= 0) {
        e.preventDefault();
        setInput(suggestions[selectedSuggestion] + ' ');
        setSuggestions([]);
        setSelectedSuggestion(-1);
        return;
      }
      handleSend();
    }
  };

  // Render output lines with improved styling
  const outputElements = history.map((entry, idx) =>
    React.createElement('div', {
      key: idx,
      className: `terminal-line ${entry.type}${entry.type === 'response' ? ' response-card' : ''}`,
    }, entry.text)
  );

  const clearConfirm = showClearConfirm ? React.createElement('div', { className: 'terminal-clear-confirm glass' },
    React.createElement('p', null, 'Clear the terminal? All output will be lost.'),
    React.createElement('div', { style: { display: 'flex', gap: '8px', marginTop: '8px' } },
      React.createElement('button', { className: 'btn btn-primary', onClick: () => confirmClear(true) }, 'Yes'),
      React.createElement('button', { className: 'btn', onClick: () => confirmClear(false) }, 'No')
    )
  ) : null;

  const suggestionList = suggestions.length > 0 ? React.createElement('div', { className: 'terminal-suggestions glass' },
    suggestions.map((s, i) =>
      React.createElement('div', {
        key: s,
        className: `suggestion-item${i === selectedSuggestion ? ' selected' : ''}`,
        onClick: () => {
          setInput(s + ' ');
          setSuggestions([]);
          inputRef.current.focus();
        }
      }, s)
    )
  ) : null;

  const inputLine = React.createElement('div', {
    className: 'terminal-line command',
    style: { display: 'flex' }
  },
    React.createElement('span', { className: 'terminal-prompt' }, userName + ' ~ '),
    React.createElement('span', null, input),
    loading && React.createElement('span', { className: 'blinking-cursor' })
  );

  return React.createElement('div', { className: 'terminal', onClick: focusInput },
    // Terminal header
    React.createElement('div', { className: 'terminal-header' },
      React.createElement('span', { className: 'terminal-title' }, 'CP Terminal'),
      React.createElement('button', {
        className: 'btn-icon',
        title: 'Clear terminal',
        onClick: () => { if (history.length > 2) setShowClearConfirm(true); else { setHistory([]); setInput(''); } }
      }, React.createElement('i', { className: 'ph ph-broom' }))
    ),

    // Output area
    React.createElement('div', { className: 'terminal-output', ref: outputRef },
      ...outputElements,
      inputLine,
      clearConfirm,
      suggestionList
    ),

    // Input area with send button
    React.createElement('div', { className: 'terminal-input-area' },
      React.createElement('span', { className: 'terminal-prompt' }, userName + ' ~ '),
      React.createElement('input', {
        ref: inputRef,
        type: 'text',
        className: 'terminal-input',
        value: input,
        onChange: (e) => {
          setInput(e.target.value);
          setSuggestions([]);
          setSelectedSuggestion(-1);
        },
        onKeyDown: handleKeyDown,
        placeholder: 'Type a command...',
        spellCheck: false,
        autoComplete: 'off',
        autoFocus: true,
        disabled: loading
      }),
      loading && React.createElement('span', { className: 'spinner', style: { marginLeft: '8px' } }),
      React.createElement('button', {
        className: 'btn btn-primary send-btn',
        onClick: handleSend,
        disabled: loading || !input.trim(),
        style: { marginLeft: '8px', padding: '10px 16px', borderRadius: '12px' }
      }, React.createElement('i', { className: 'ph ph-paper-plane-right' }))
    ),

    // CSS animations inlined
    React.createElement('style', null, `
      @keyframes blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0; }
      }
      .blinking-cursor {
        display: inline-block;
        width: 8px; height: 1.2em;
        background: var(--accent-light);
        margin-left: 2px;
        animation: blink 1s step-end infinite;
        vertical-align: text-bottom;
      }
    `)
  );
}
