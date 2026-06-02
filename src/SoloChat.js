import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useUser } from './UserContext.js';
import { useToast } from './ToastContext.js';
import { MOVIE_API_KEY } from './config.js';

// Quick command buttons
const QUICK_COMMANDS = ['help', 'weather', 'joke', 'news', 'crypto', 'time', 'clear'];

// Command descriptions (used in predictor and help)
const COMMAND_DESCRIPTIONS = {
  help: 'Show all commands',
  clear: 'Clear the screen',
  time: 'Current time',
  date: 'Today\'s date',
  echo: 'Print text',
  whoami: 'Your username',
  version: 'Terminal version',
  system: 'System info',
  weather: 'Weather (city)',
  define: 'Define a word',
  crypto: 'Crypto price',
  joke: 'Random joke',
  news: 'Latest headlines',
  qr: 'Generate QR code',
  ip: 'Your public IP',
  lyrics: 'Song lyrics',
  movie: 'Movie info',
  trivia: 'Random trivia',
  advice: 'Get advice',
  catfact: 'Cat fact',
  quote: 'Inspirational quote',
  numberfact: 'Number fact',
  calc: 'Evaluate math (e.g., calc 2+2)',
  currency: 'Convert currency',
  timezone: 'Time in timezone',
  install: 'Install app',
  alias: 'Create alias',
  unalias: 'Remove alias',
  aliases: 'List aliases',
  history: 'Command history',
  export: 'Export log',
  cowsay: 'Cow says...',
  fortune: 'Random fortune',
  sudo: 'Fake root',
  uptime: 'Fake uptime',
  ping: 'Ping host',
  figlet: 'ASCII art',
};

export default function SoloChat() {
  const currentUser = useUser();
  const { addToast } = useToast();
  const userName = useMemo(() => currentUser?.displayName || currentUser?.email || 'guest', [currentUser]);

  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem('cp-terminal-history');
    return saved ? JSON.parse(saved) : [{ type: 'response', text: 'Welcome to CP Terminal. Type "help" or tap a quick command below.' }];
  });
  const [input, setInput] = useState('');
  const [commandHistory, setCommandHistory] = useState(() => {
    const saved = localStorage.getItem('cp-command-history');
    return saved ? JSON.parse(saved) : [];
  });
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [aliases, setAliases] = useState(() => JSON.parse(localStorage.getItem('cp-aliases') || '{}'));
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const outputRef = useRef(null);
  const inputRef = useRef(null);
  const deferredPromptRef = useRef(null);
  const [installAvailable, setInstallAvailable] = useState(false);

  // Persist state
  useEffect(() => { localStorage.setItem('cp-terminal-history', JSON.stringify(history.slice(-200))); }, [history]);
  useEffect(() => { localStorage.setItem('cp-command-history', JSON.stringify(commandHistory.slice(-100))); }, [commandHistory]);
  useEffect(() => { localStorage.setItem('cp-aliases', JSON.stringify(aliases)); }, [aliases]);
  useEffect(() => { outputRef.current?.scrollTo(0, outputRef.current.scrollHeight); }, [history]);
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); deferredPromptRef.current = e; setInstallAvailable(true); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const allCommands = useMemo(() => {
    const cmds = Object.keys(COMMAND_DESCRIPTIONS);
    return [...cmds, ...Object.keys(aliases)];
  }, [aliases]);

  const focusInput = () => inputRef.current?.focus();
  useEffect(() => { focusInput(); }, []);

  const fetchWithTimeout = (url, timeout = 5000) =>
    Promise.race([fetch(url), new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), timeout))]);

  const formatResponse = (text) => `[${new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}] ${text}`;

  // Predictor logic
  useEffect(() => {
    if (!input.trim()) { setSuggestions([]); setSelectedSuggestion(-1); return; }
    const parts = input.trim().split(/\s+/);
    const partial = parts[0].toLowerCase();
    const matches = allCommands.filter(cmd => cmd.startsWith(partial));
    setSuggestions(matches.slice(0, 8)); // limit to 8
    setSelectedSuggestion(matches.length > 0 ? 0 : -1);
  }, [input, allCommands]);

  // Copy response text
  const copyResponse = (text) => {
    navigator.clipboard?.writeText(text);
    addToast('Copied to clipboard', 'success');
  };

  const executeCommand = useCallback(async (rawCmd) => {
    const trimmed = rawCmd.trim();
    if (!trimmed) return;
    const newHistory = [...history, { type: 'command', text: trimmed }];
    setCommandHistory(prev => [...prev, trimmed]);
    setHistoryIndex(-1);
    setSuggestions([]);
    let parts = trimmed.split(/\s+/);
    let main = parts[0].toLowerCase();
    let args = parts.slice(1);
    if (aliases[main]) {
      const expansion = aliases[main].split(/\s+/);
      main = expansion[0].toLowerCase();
      args = expansion.slice(1).concat(args);
    }
    if (main === 'clear') {
      if (history.length > 2) { setShowClearConfirm(true); return; }
      setHistory([]); setInput(''); setShowClearConfirm(false); return;
    }
    if (showClearConfirm) setShowClearConfirm(false);

    const cloudCmds = ['weather','define','crypto','joke','news','qr','ip','fact','randomuser','timezone','currency','lyrics','movie','trivia','advice','catfact','quote','numberfact'];
    if (cloudCmds.includes(main)) {
      setLoading(true);
      setHistory([...newHistory, { type: 'response', text: 'Fetching...' }]);
      setInput('');
      try {
        let result = '';
        switch (main) {
          case 'weather': {
            if (!args[0]) result = 'Usage: weather <city>';
            else {
              const city = args.join(' ');
              const res = await fetchWithTimeout(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
              if (!res.ok) throw new Error('City not found');
              const data = await res.json();
              const current = data.current_condition[0];
              result = `Weather in ${city}: ${current.weatherDesc[0].value}, ${current.temp_C}°C (feels like ${current.FeelsLikeC}°C), humidity ${current.humidity}%`;
            }
            break;
          }
          case 'define': {
            if (!args[0]) result = 'Usage: define <word>';
            else {
              const res = await fetchWithTimeout(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(args[0])}`);
              if (!res.ok) throw new Error('Word not found');
              const data = await res.json();
              const e = data[0];
              let defs = '';
              e.meanings.slice(0,2).forEach(m => { defs += `  ${m.partOfSpeech}: ${m.definitions[0].definition}\n`; });
              result = `Definition: ${e.word}\n${defs.trim()}`;
            }
            break;
          }
          case 'crypto': {
            if (!args[0]) result = 'Usage: crypto <coin_id>';
            else {
              const res = await fetchWithTimeout(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(args[0])}&vs_currencies=usd`);
              if (!res.ok) throw new Error('Coin not found');
              const data = await res.json();
              if (!data[args[0]]) throw new Error('Coin not found');
              result = `Price: ${args[0].toUpperCase()} = $${data[args[0]].usd}`;
            }
            break;
          }
          case 'joke': {
            const res = await fetchWithTimeout('https://official-joke-api.appspot.com/random_joke');
            if (!res.ok) throw new Error('Joke fetch failed');
            const d = await res.json();
            result = `${d.setup}\n   ${d.punchline}`;
            break;
          }
          case 'news': {
            try {
              const res = await fetchWithTimeout('https://feeds.npr.org/1001/rss.xml');
              const text = await res.text();
              const items = text.match(/<title>(?!NPR Topics:)([^<]+)<\/title>/g);
              if (items && items.length > 0) {
                result = 'Latest from NPR:\n';
                items.slice(0,5).forEach((t,i) => result += `${i+1}. ${t.replace(/<[^>]+>/g,'')}\n`);
              } else result = 'No news found.';
            } catch { result = 'News feed unavailable.'; }
            break;
          }
          case 'qr': {
            if (!args[0]) result = 'Usage: qr <text or url>';
            else result = `QR Code: https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(args.join(' '))}`;
            break;
          }
          case 'ip': {
            const res = await fetchWithTimeout('https://api.ipify.org?format=json');
            const data = await res.json();
            result = `Your IP: ${data.ip}`;
            break;
          }
          case 'fact': {
            const res = await fetchWithTimeout('https://uselessfacts.jsph.pl/random.json?language=en');
            const data = await res.json();
            result = `Fact: ${data.text}`;
            break;
          }
          case 'randomuser': {
            const res = await fetchWithTimeout('https://randomuser.me/api/');
            const data = await res.json();
            const u = data.results[0];
            result = `User: ${u.name.first} ${u.name.last}\n   ${u.email}`;
            break;
          }
          case 'timezone': {
            if (!args[0]) result = 'Usage: timezone <area>/<city>';
            else {
              const res = await fetchWithTimeout(`https://worldtimeapi.org/api/timezone/${encodeURIComponent(args[0])}`);
              if (!res.ok) throw new Error('Invalid timezone');
              const data = await res.json();
              result = `Timezone: ${data.timezone} - ${data.datetime.split('T')[1].split('.')[0]}`;
            }
            break;
          }
          case 'currency': {
            if (args.length < 3) result = 'Usage: currency <amount> <from> <to> (e.g., currency 100 USD EUR)';
            else {
              const amount = args[0];
              const from = args[1].toUpperCase();
              const to = args[2].toUpperCase();
              const res = await fetchWithTimeout(`https://api.exchangerate.host/convert?from=${from}&to=${to}&amount=${amount}`);
              if (!res.ok) throw new Error('Conversion failed');
              const data = await res.json();
              result = `Conversion: ${amount} ${from} = ${data.result} ${to}`;
            }
            break;
          }
          case 'lyrics': {
            if (args.length < 2) result = 'Usage: lyrics <artist> <song>';
            else {
              const artist = args[0];
              const song = args.slice(1).join(' ');
              const res = await fetchWithTimeout(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(song)}`);
              if (!res.ok) throw new Error('Lyrics not found');
              const data = await res.json();
              if (data.lyrics) {
                result = `Lyrics: ${song} by ${artist}\n\n${data.lyrics}`;
                if (result.length > 2000) result = result.slice(0,2000) + '\n... (truncated)';
              } else result = 'No lyrics found.';
            }
            break;
          }
          case 'movie': {
            if (!args[0]) result = 'Usage: movie <title>';
            else {
              const apiKey = MOVIE_API_KEY || 'trilogy';
              const res = await fetchWithTimeout(`https://www.omdbapi.com/?t=${encodeURIComponent(args.join(' '))}&apikey=${apiKey}`);
              if (!res.ok) throw new Error('Movie not found');
              const data = await res.json();
              if (data.Error) throw new Error(data.Error);
              result = `Movie: ${data.Title} (${data.Year})\nRating: ${data.imdbRating}\nPlot: ${data.Plot}`;
            }
            break;
          }
          case 'trivia': {
            const res = await fetchWithTimeout('https://opentdb.com/api.php?amount=1');
            if (!res.ok) throw new Error('Trivia not available');
            const data = await res.json();
            if (!data.results || data.results.length === 0) throw new Error('No trivia found');
            const q = data.results[0];
            const answers = [...q.incorrect_answers, q.correct_answer].sort(() => Math.random() - 0.5);
            result = `Trivia: ${q.question}\n\n` + answers.map((a, i) => `${i+1}. ${a}`).join('\n') + `\n\nAnswer: ${q.correct_answer}`;
            break;
          }
          case 'advice': {
            const res = await fetchWithTimeout('https://api.adviceslip.com/advice');
            if (!res.ok) throw new Error('Advice not available');
            const data = await res.json();
            result = `Advice: ${data.slip.advice}`;
            break;
          }
          case 'catfact': {
            const res = await fetchWithTimeout('https://catfact.ninja/fact');
            if (!res.ok) throw new Error('Cat fact not available');
            const data = await res.json();
            result = `Cat Fact: ${data.fact}`;
            break;
          }
          case 'quote': {
            const res = await fetchWithTimeout('https://api.quotable.io/random');
            if (!res.ok) throw new Error('Quote not available');
            const data = await res.json();
            result = `"${data.content}" — ${data.author}`;
            break;
          }
          case 'numberfact': {
            const num = args[0] || 'random';
            const res = await fetchWithTimeout(`http://numbersapi.com/${num}`);
            if (!res.ok) throw new Error('Number fact not available');
            const text = await res.text();
            result = `Number Fact: ${text}`;
            break;
          }
        }
        setHistory(prev => [...prev.slice(0,-1), { type: 'response', text: formatResponse(result) }]);
      } catch (err) {
        setHistory(prev => [...prev.slice(0,-1), { type: 'error', text: formatResponse('Error: ' + err.message) }]);
      }
      setLoading(false);
      return;
    }

    // Local commands
    let response = ''; let isError = false;
    switch (main) {
      case 'help': {
        const groups = {
          'General': ['help','clear','time','date','echo','whoami','version','system'],
          'Internet': ['weather','define','crypto','joke','news','qr','ip','lyrics','movie'],
          'Fun': ['trivia','advice','catfact','quote','numberfact','cowsay','fortune','figlet','randomuser'],
          'Math/Finance': ['calc','currency','timezone'],
          'Aliases': ['alias','unalias','aliases'],
          'System': ['install','history','export','sudo','uptime','ping']
        };
        let helpText = '\n  ╔════════════════════════════════╗\n';
        for (const [group, cmds] of Object.entries(groups)) {
          helpText += `  ║  ${group.toUpperCase().padEnd(26)} ║\n`;
          cmds.forEach(cmd => {
            const desc = COMMAND_DESCRIPTIONS[cmd] || '';
            helpText += `  ║  ${cmd.padEnd(14)} ${desc.padEnd(12)} ║\n`;
          });
          helpText += '  ╠════════════════════════════════╣\n';
        }
        helpText += '  ║  Type any command to use it.   ║\n';
        helpText += '  ╚════════════════════════════════╝\n';
        response = helpText;
        break;
      }
      case 'install': {
        if (deferredPromptRef.current) {
          try {
            deferredPromptRef.current.prompt();
            const { outcome } = await deferredPromptRef.current.userChoice;
            response = outcome === 'accepted' ? 'App installation started.' : 'Installation cancelled.';
            deferredPromptRef.current = null; setInstallAvailable(false);
          } catch { response = 'Install failed.'; }
        } else if (installAvailable) response = 'Install prompt ready. Try again.';
        else response = 'Install not available. Tap browser menu and select "Add to Home screen".';
        break;
      }
      case 'system': {
        response = `CP Terminal v3.0\nUser: ${userName}\nPlatform: ${navigator.platform}\nUser Agent: ${navigator.userAgent}`;
        break;
      }
      case 'time': response = new Date().toLocaleTimeString(); break;
      case 'date': response = new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' }); break;
      case 'echo': response = args.join(' '); break;
      case 'whoami': response = userName; break;
      case 'version': response = 'CP Terminal v3.0'; break;
      case 'calc': {
        try {
          const expr = args.join(''); if (!expr) throw new Error('No expression');
          const sanitized = expr.replace(/[^0-9+\-*/().%\s]/g, '');
          if (sanitized !== expr.replace(/\s/g,'')) throw new Error('Invalid characters');
          const result = Function('"use strict"; return (' + sanitized + ')')();
          if (!isFinite(result)) throw new Error('Invalid calculation');
          response = `= ${result}`;
        } catch(e) { response = 'Error: ' + e.message; isError = true; }
        break;
      }
      case 'quote': response = '"The only way to do great work is to love what you do." – Steve Jobs'; break;
      case 'history': {
        if (args[0] === 'search' && args[1]) {
          const term = args.slice(1).join(' ').toLowerCase();
          const filtered = commandHistory.filter(c => c.toLowerCase().includes(term));
          response = filtered.length ? `History (matching "${term}"):\n` + filtered.map((c,i) => `${i+1}. ${c}`).join('\n') : 'No matching commands found.';
        } else {
          const list = commandHistory.map((c,i) => `${i+1}. ${c}`).join('\n');
          response = list ? `Command History:\n${list}` : 'No commands yet.';
        }
        break;
      }
      case 'export': {
        const log = history.map(entry => entry.type === 'command' ? entry.text : `[${entry.type}] ${entry.text}`).join('\n');
        const blob = new Blob([log], { type:'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `cp-terminal-log-${new Date().toISOString().slice(0,10)}.txt`; a.click();
        URL.revokeObjectURL(url);
        response = 'Terminal log exported.';
        break;
      }
      case 'cowsay': {
        const msg = args.join(' ') || 'Moo!';
        const cow = `
   ${msg}
   ${' '.repeat(msg.length).replace(/./g, '-')}
  \\   ^__^
   \\  (oo)\\_______
      (__)\\       )\\/\\
          ||----w |
          ||     ||
`;
        response = cow;
        break;
      }
      case 'fortune': {
        const fortunes = [
          'The early bird gets the worm, but the second mouse gets the cheese.',
          'A journey of a thousand miles begins with a single step.',
          'All that glitters is not gold.',
          'Actions speak louder than words.',
          'You can\'t have your cake and eat it too.',
          'The best time to plant a tree was 20 years ago. The second best time is now.',
          'Be yourself; everyone else is already taken.',
          'You miss 100% of the shots you don\'t take.'
        ];
        const random = fortunes[Math.floor(Math.random() * fortunes.length)];
        response = `Fortune: ${random}`;
        break;
      }
      case 'sudo': response = 'Sorry, you are not root.'; break;
      case 'uptime': {
        const fake = Math.floor(Math.random()*10000) + 100;
        response = `Uptime: ${fake} hours (simulated)`;
        break;
      }
      case 'ping': {
        if (!args[0]) response = 'Usage: ping <host>';
        else {
          const host = args[0];
          const delay = Math.floor(Math.random()*150)+20;
          response = `Pinging ${host} ...\nReply from ${host}: time=${delay}ms (simulated)`;
        }
        break;
      }
      case 'figlet': {
        const text = args.join(' ') || 'Hello';
        const ascii = text.toUpperCase().split('').map(ch => ch === ' ' ? '  ' : ch + ' ').join(' ');
        response = `ASCII: ${ascii}`;
        break;
      }
      case 'alias': {
        if (args.length < 2) response = 'Usage: alias <short> <command>';
        else {
          const short = args[0];
          const full = args.slice(1).join(' ');
          setAliases(prev => ({ ...prev, [short]: full }));
          response = `Alias set: ${short} -> ${full}`;
        }
        break;
      }
      case 'unalias': {
        if (!args[0]) response = 'Usage: unalias <short>';
        else {
          const short = args[0];
          if (aliases[short]) {
            setAliases(prev => { const n = {...prev}; delete n[short]; return n; });
            response = `Alias removed: ${short}`;
          } else { response = `Alias not found: ${short}`; isError = true; }
        }
        break;
      }
      case 'aliases': {
        if (Object.keys(aliases).length === 0) response = 'No aliases set.';
        else response = 'Aliases:\n' + Object.entries(aliases).map(([k,v]) => `  ${k} -> ${v}`).join('\n');
        break;
      }
      default: response = `Command not found: ${main}. Type "help".`; isError = true;
    }
    setHistory([...newHistory, { type: isError ? 'error' : 'response', text: formatResponse(response) }]);
    setInput('');
  }, [history, aliases, showClearConfirm, userName, installAvailable]);

  const confirmClear = (conf) => { if (conf) { setHistory([]); setInput(''); } setShowClearConfirm(false); };

  const selectSuggestion = (cmd) => {
    setInput(cmd + ' ');
    setSuggestions([]);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      if (suggestions.length === 1) {
        selectSuggestion(suggestions[0]);
      } else if (suggestions.length > 1) {
        setSelectedSuggestion(prev => (prev + 1) % suggestions.length);
      }
    } else if (e.key === 'Enter') {
      if (suggestions.length > 0 && selectedSuggestion >= 0) {
        e.preventDefault();
        selectSuggestion(suggestions[selectedSuggestion]);
        return;
      }
      executeCommand(input);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (suggestions.length > 0) {
        setSelectedSuggestion(prev => (prev - 1 + suggestions.length) % suggestions.length);
      } else {
        const newIndex = historyIndex === -1 ? commandHistory.length-1 : Math.max(0, historyIndex-1);
        setHistoryIndex(newIndex);
        if (commandHistory[newIndex]) setInput(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (suggestions.length > 0) {
        setSelectedSuggestion(prev => (prev + 1) % suggestions.length);
      } else {
        const newIndex = historyIndex + 1;
        if (newIndex < commandHistory.length) { setHistoryIndex(newIndex); setInput(commandHistory[newIndex]); }
        else { setHistoryIndex(-1); setInput(''); }
      }
    }
  };

  // Render output lines with copy button for each response
  const outputElements = history.map((entry, idx) => {
    const className = `terminal-line ${entry.type}${entry.type === 'response' ? ' response-card' : ''}`;
    if (entry.type === 'response' || entry.type === 'error') {
      return React.createElement('div', { key: idx, className, style: { position: 'relative' } },
        React.createElement('span', null, entry.text),
        React.createElement('button', {
          className: 'btn-icon copy-btn',
          onClick: () => copyResponse(entry.text),
          title: 'Copy',
          style: { position: 'absolute', top: '4px', right: '4px', fontSize: '0.7rem', opacity: 0.5 }
        }, React.createElement('i', { className: 'ph ph-copy-simple' }))
      );
    }
    return React.createElement('div', { key: idx, className }, entry.text);
  });

  const clearConfirmDialog = showClearConfirm ? React.createElement('div', { className: 'terminal-clear-confirm glass' },
    React.createElement('p', null, 'Clear the terminal? All output will be lost.'),
    React.createElement('div', { style: { display:'flex', gap:'8px', marginTop:'8px' } },
      React.createElement('button', { className: 'btn btn-primary', onClick: () => confirmClear(true) }, 'Yes'),
      React.createElement('button', { className: 'btn', onClick: () => confirmClear(false) }, 'No')
    )
  ) : null;

  // Predictor dropdown
  const predictor = suggestions.length > 0 ? React.createElement('div', { className: 'terminal-predictor glass' },
    suggestions.map((cmd, i) =>
      React.createElement('div', {
        key: cmd,
        className: `predictor-item${i === selectedSuggestion ? ' selected' : ''}`,
        onMouseDown: (e) => { e.preventDefault(); selectSuggestion(cmd); }
      },
        React.createElement('i', { className: 'ph ph-terminal-window', style: { marginRight: '8px', opacity: 0.6 } }),
        React.createElement('span', { style: { flex: 1 } }, cmd),
        React.createElement('span', { style: { fontSize: '0.7rem', opacity: 0.5, marginLeft: '8px' } }, COMMAND_DESCRIPTIONS[cmd] || '')
      )
    )
  ) : null;

  // Quick command buttons
  const quickCommandsBar = React.createElement('div', { className: 'quick-commands' },
    QUICK_COMMANDS.map(cmd =>
      React.createElement('button', {
        key: cmd,
        className: 'btn btn-small',
        onClick: () => executeCommand(cmd),
      }, cmd)
    )
  );

  const inputLine = React.createElement('div', { className: 'terminal-line command', style: { display:'flex' } },
    React.createElement('span', { className: 'terminal-prompt' }, userName + ' ~ '),
    React.createElement('span', null, input || (loading ? '...' : '')),
    loading && React.createElement('span', { className: 'blinking-cursor' })
  );

  return React.createElement('div', { className: 'terminal', onClick: focusInput },
    React.createElement('div', { className: 'terminal-header' },
      React.createElement('span', { className: 'terminal-title' }, 'CP Terminal'),
      React.createElement('div', { className: 'terminal-header-actions' },
        installAvailable && React.createElement('button', { className: 'btn-icon', title: 'Install App', onClick: () => executeCommand('install') },
          React.createElement('i', { className: 'ph ph-download-simple' })),
        React.createElement('button', { className: 'btn-icon', title: 'Clear', onClick: () => { if (history.length > 2) setShowClearConfirm(true); else { setHistory([]); setInput(''); } } },
          React.createElement('i', { className: 'ph ph-broom' }))
      )
    ),
    quickCommandsBar,
    React.createElement('div', { className: 'terminal-output', ref: outputRef },
      ...outputElements,
      inputLine,
      clearConfirmDialog,
      predictor
    ),
    React.createElement('div', { className: 'terminal-input-area' },
      React.createElement('span', { className: 'terminal-prompt' }, userName + ' ~ '),
      React.createElement('input', { ref: inputRef, type:'text', className:'terminal-input', value:input,
        onChange: (e) => setInput(e.target.value),
        onKeyDown: handleKeyDown, placeholder:'Type a command...', spellCheck:false, autoComplete:'off', autoFocus:true, disabled:loading
      }),
      loading && React.createElement('span', { className:'spinner', style:{ marginLeft:'8px' } }),
      React.createElement('button', { className:'btn btn-primary send-btn', onClick: () => executeCommand(input), disabled: loading || !input.trim(),
        style:{ marginLeft:'8px', padding:'10px 16px', borderRadius:'12px' } },
        React.createElement('i', { className:'ph ph-paper-plane-right' }))
    ),
    React.createElement('style', null, `
      @keyframes blink { 0%,100%{ opacity:1 } 50%{ opacity:0 } }
      .blinking-cursor { display:inline-block; width:8px; height:1.2em; background:var(--accent-light); margin-left:2px; animation:blink 1s step-end infinite; vertical-align:text-bottom; }
      .terminal-predictor { position:absolute; bottom:70px; left:0; right:0; max-height:160px; overflow-y:auto; z-index:10; padding:8px; border-radius:12px; margin:0 4px; animation: fadeIn 0.2s ease; }
      .predictor-item { padding:6px 12px; cursor:pointer; display:flex; align-items:center; border-radius:8px; transition: background 0.2s; }
      .predictor-item:hover, .predictor-item.selected { background:var(--surface-hover); }
      .quick-commands { display:flex; gap:6px; padding:8px 16px; overflow-x:auto; border-bottom:1px solid var(--border); margin-bottom:4px; }
      .quick-commands .btn { padding:6px 12px; font-size:0.75rem; border-radius:20px; white-space:nowrap; }
      .copy-btn { transition: opacity 0.2s; }
      .copy-btn:hover { opacity:1 !important; }
    `)
  );
    }
