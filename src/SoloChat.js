import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useUser } from './UserContext.js';
import { MOVIE_API_KEY } from './config.js';

export default function SoloChat() {
  const currentUser = useUser();
  const userName = useMemo(() => currentUser?.displayName || currentUser?.email || 'guest', [currentUser]);

  // ---- STATE ----
  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem('cp-terminal-history');
    return saved ? JSON.parse(saved) : [
      { type: 'response', text: 'Welcome to CP Terminal v3.0\nType "help" to see all commands.' }
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
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const [showTypingIndicator, setShowTypingIndicator] = useState(false);
  const [installAvailable, setInstallAvailable] = useState(false);

  const outputRef = useRef(null);
  const inputRef = useRef(null);

  // ---- REFS FOR INSTALL PROMPT ----
  const deferredPromptRef = useRef(null);

  // ---- PERSISTENCE ----
  useEffect(() => {
    localStorage.setItem('cp-terminal-history', JSON.stringify(history.slice(-200)));
  }, [history]);
  useEffect(() => {
    localStorage.setItem('cp-command-history', JSON.stringify(commandHistory.slice(-100)));
  }, [commandHistory]);
  useEffect(() => {
    localStorage.setItem('cp-aliases', JSON.stringify(aliases));
  }, [aliases]);

  // ---- SCROLL TO BOTTOM ----
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [history, showTypingIndicator]);

  // ---- INSTALL EVENT LISTENER ----
  useEffect(() => {
    const beforeInstallHandler = (e) => {
      e.preventDefault();
      deferredPromptRef.current = e;
      setInstallAvailable(true);
    };
    window.addEventListener('beforeinstallprompt', beforeInstallHandler);
    return () => window.removeEventListener('beforeinstallprompt', beforeInstallHandler);
  }, []);

  // ---- AUTO-FOCUS ----
  const focusInput = useCallback(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  useEffect(() => {
    focusInput();
  }, [focusInput]);

  // ---- FETCH HELPER ----
  const fetchWithTimeout = (url, timeout = 5000) => {
    return Promise.race([
      fetch(url),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), timeout))
    ]);
  };

  // ---- FORMAT OUTPUT WITH TIMESTAMP ----
  const formatResponse = (text) => {
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `[${now}] ${text}`;
  };

  // ---- COMMAND LIST (for autocomplete & help) ----
  const allCommands = useMemo(() => [
    'help', 'clear', 'time', 'date', 'echo', 'whoami', 'version', 'calc',
    'weather', 'define', 'crypto', 'joke', 'news', 'qr', 'ip', 'fact',
    'randomuser', 'timezone', 'currency', 'lyrics', 'movie', 'install',
    'alias', 'unalias', 'aliases', 'quote', 'history', 'export', 'cowsay',
    'fortune', 'sudo', 'uptime', 'ping', 'figlet',
    ...Object.keys(aliases)
  ], [aliases]);

  // ---- COMMAND HELP MAP ----
  const commandHelp = useMemo(() => ({
    help: 'Show all commands with descriptions',
    clear: 'Clear the terminal screen',
    time: 'Display current time',
    date: 'Display today\'s date',
    echo: 'Echo a message',
    whoami: 'Show your username',
    version: 'Show terminal version',
    calc: 'Evaluate a mathematical expression (e.g., calc 2+2)',
    weather: 'Get weather for a city (e.g., weather London)',
    define: 'Define a word (e.g., define hello)',
    crypto: 'Get cryptocurrency price (e.g., crypto bitcoin)',
    joke: 'Get a random joke',
    news: 'Show latest news headlines',
    qr: 'Generate a QR code for a text/URL (e.g., qr https://example.com)',
    ip: 'Show your public IP address',
    fact: 'Get a random interesting fact',
    randomuser: 'Generate a random user profile',
    timezone: 'Get current time in a timezone (e.g., timezone Europe/London)',
    currency: 'Convert currency (e.g., currency 100 USD EUR)',
    lyrics: 'Fetch song lyrics (e.g., lyrics Queen Bohemian Rhapsody)',
    movie: 'Get movie info (e.g., movie Inception)',
    install: 'Install this app as a PWA (if available)',
    alias: 'Create a command alias (e.g., alias gs git status)',
    unalias: 'Remove an alias (e.g., unalias gs)',
    aliases: 'List all defined aliases',
    quote: 'Get an inspirational quote',
    history: 'Show command history',
    export: 'Export terminal log as text file',
    cowsay: 'Make a cow say something (e.g., cowsay Hello)',
    fortune: 'Get a random fortune',
    sudo: 'Do nothing (just for fun)',
    uptime: 'Show how long the terminal has been running (fake)',
    ping: 'Ping a website (simulated)',
    figlet: 'Generate ASCII art text (simple)'
  }), []);

  // ---- EXECUTE COMMAND ----
  const executeCommand = useCallback(async (rawCmd) => {
    const trimmedCmd = rawCmd.trim();
    if (!trimmedCmd) return;

    const newHistory = [...history, { type: 'command', text: `> ${trimmedCmd}` }];
    setCommandHistory(prev => [...prev, trimmedCmd]);
    setHistoryIndex(-1);
    setSuggestions([]);

    let parts = trimmedCmd.split(/\s+/);
    let mainCmd = parts[0].toLowerCase();
    let args = parts.slice(1);

    // Resolve alias
    if (aliases[mainCmd]) {
      const expansion = aliases[mainCmd].split(/\s+/);
      mainCmd = expansion[0].toLowerCase();
      args = expansion.slice(1).concat(args);
    }

    // ---- LOCAL COMMANDS ----
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

    // ---- CLOUD COMMANDS ----
    const cloudCmds = ['weather','define','crypto','joke','news','qr','ip','fact','randomuser','timezone','currency','lyrics','movie'];
    if (cloudCmds.includes(mainCmd)) {
      setLoading(true);
      setShowTypingIndicator(true);
      setHistory([...newHistory, { type: 'response', text: 'Fetching...' }]);
      setInput('');
      try {
        let result = '';
        switch (mainCmd) {
          case 'weather': {
            if (!args[0]) result = 'Usage: weather <city>';
            else {
              const city = args.join(' ');
              const res = await fetchWithTimeout(`https://wttr.in/${encodeURIComponent(city)}?format=%C+%t+%w`);
              if (!res.ok) throw new Error('City not found');
              const text = await res.text();
              if (text.trim().startsWith('<')) throw new Error('Invalid response from service');
              result = `Weather in ${city}: ${text.trim()}`;
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
              e.meanings.slice(0, 2).forEach(m => {
                defs += `  ${m.partOfSpeech}: ${m.definitions[0].definition}\n`;
              });
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
                items.slice(0, 5).forEach((t, i) => result += `${i+1}. ${t.replace(/<[^>]+>/g, '')}\n`);
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
                if (result.length > 2000) result = result.slice(0, 2000) + '\n... (truncated)';
              } else {
                result = 'No lyrics found.';
              }
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
        }
        setHistory(prev => [...prev.slice(0, -1), { type: 'response', text: formatResponse(result) }]);
      } catch (err) {
        setHistory(prev => [...prev.slice(0, -1), { type: 'error', text: formatResponse('Error: ' + err.message) }]);
      }
      setLoading(false);
      setShowTypingIndicator(false);
      return;
    }

    // ---- OTHER LOCAL COMMANDS ----
    let response = '';
    let isError = false;
    switch (mainCmd) {
      case 'help': {
        const entries = Object.entries(commandHelp);
        const pageSize = 10;
        let page = 1;
        if (args.length === 2 && args[0] === 'page') {
          page = parseInt(args[1], 10);
          if (isNaN(page) || page < 1) page = 1;
        }
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        const pageEntries = entries.slice(start, end);
        if (pageEntries.length === 0) {
          response = `No more commands. (Page ${page})`;
        } else {
          let helpText = `Available Commands (Page ${page}/${Math.ceil(entries.length / pageSize)})\n\n`;
          pageEntries.forEach(([cmd, desc]) => {
            helpText += `  ${cmd.padEnd(12)} ${desc}\n`;
          });
          helpText += `\nUse "help page <number>" to see more.`;
          response = helpText;
        }
        break;
      }
      case 'install': {
        if (deferredPromptRef.current) {
          try {
            deferredPromptRef.current.prompt();
            const outcome = await deferredPromptRef.current.userChoice;
            if (outcome.outcome === 'accepted') {
              response = 'App installation started.';
            } else {
              response = 'Installation cancelled.';
            }
            deferredPromptRef.current = null;
            setInstallAvailable(false);
          } catch (e) {
            response = 'Install failed. Try again later.';
          }
        } else if (installAvailable) {
          response = 'Install prompt is ready but not triggered. Try again.';
        } else {
          response = 'Install not available. Tap browser menu and select "Add to Home screen".';
        }
        break;
      }
      case 'time':
        response = `Time: ${new Date().toLocaleTimeString()}`;
        break;
      case 'date':
        response = `Date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
        break;
      case 'echo':
        response = args.join(' ');
        break;
      case 'whoami':
        response = `User: ${userName}`;
        break;
      case 'version':
        response = 'CP Terminal v3.0 - PWA Enhanced Edition';
        break;
      case 'calc': {
        try {
          const expr = args.join('');
          if (!expr) throw new Error('No expression');
          const sanitized = expr.replace(/[^0-9+\-*/().%\s]/g, '');
          if (sanitized !== expr.replace(/\s/g, '')) throw new Error('Invalid characters');
          const result = Function('"use strict"; return (' + sanitized + ')')();
          if (!isFinite(result)) throw new Error('Invalid calculation');
          response = `Result: ${result}`;
        } catch (e) {
          response = 'Error: ' + e.message;
          isError = true;
        }
        break;
      }
      case 'quote':
        response = '"The only way to do great work is to love what you do." - Steve Jobs';
        break;
      case 'history': {
        const historyList = commandHistory.map((c, i) => `${i+1}. ${c}`).join('\n');
        response = historyList ? `Command History:\n${historyList}` : 'No commands yet.';
        break;
      }
      case 'export': {
        const logText = history.map(entry => 
          entry.type === 'command' ? entry.text : `[${entry.type}] ${entry.text}`
        ).join('\n');
        const blob = new Blob([logText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cp-terminal-log-${new Date().toISOString().slice(0,10)}.txt`;
        a.click();
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
      case 'sudo': {
        response = 'Sorry, you are not root. (But nice try!)';
        break;
      }
      case 'uptime': {
        const fakeUptime = Math.floor(Math.random() * 10000) + 100;
        response = `Uptime: ${fakeUptime} hours (simulated)`;
        break;
      }
      case 'ping': {
        if (!args[0]) response = 'Usage: ping <hostname>';
        else {
          const host = args[0];
          const delay = Math.floor(Math.random() * 150) + 20;
          response = `Pinging ${host} ...\nReply from ${host}: time=${delay}ms (simulated)`;
        }
        break;
      }
      case 'figlet': {
        const text = args.join(' ') || 'Hello';
        const ascii = text.toUpperCase().split('').map(char => {
          if (char === ' ') return '  ';
          return char + ' ';
        }).join(' ');
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
            setAliases(prev => { const n = { ...prev }; delete n[short]; return n; });
            response = `Alias removed: ${short}`;
          } else {
            response = `Alias not found: ${short}`;
            isError = true;
          }
        }
        break;
      }
      case 'aliases': {
        if (Object.keys(aliases).length === 0) response = 'No aliases set.';
        else response = 'Aliases:\n' + Object.entries(aliases).map(([k, v]) => `  ${k} -> ${v}`).join('\n');
        break;
      }
      default: {
        response = `Command not found: ${mainCmd}. Type "help" for available commands.`;
        isError = true;
      }
    }

    const entry = { type: isError ? 'error' : 'response', text: formatResponse(response) };
    setHistory([...newHistory, entry]);
    setInput('');
  }, [history, aliases, showClearConfirm, userName, commandHistory, commandHelp, installAvailable]);

  // ---- CLEAR CONFIRM ----
  const confirmClear = (confirmed) => {
    if (confirmed) {
      setHistory([]);
      setInput('');
    }
    setShowClearConfirm(false);
  };

  // ---- AUTOCOMPLETE ----
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

  // ---- KEYBOARD HANDLING ----
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
      executeCommand(input);
    }
  };

  // ---- RENDER OUTPUT LINES ----
  const outputElements = history.map((entry, idx) => {
    let className = 'terminal-line';
    if (entry.type === 'command') className += ' command';
    else if (entry.type === 'response') className += ' response';
    else if (entry.type === 'error') className += ' error';
    return React.createElement('div', { key: idx, className }, entry.text);
  });

  // ---- CLEAR CONFIRM DIALOG ----
  const clearConfirmDialog = showClearConfirm ? React.createElement('div', { className: 'terminal-clear-confirm glass' },
    React.createElement('p', null, 'Clear the terminal? All output will be lost.'),
    React.createElement('div', { style: { display: 'flex', gap: '8px', marginTop: '8px' } },
      React.createElement('button', { className: 'btn btn-primary', onClick: () => confirmClear(true) }, 'Yes'),
      React.createElement('button', { className: 'btn', onClick: () => confirmClear(false) }, 'No')
    )
  ) : null;

  // ---- SUGGESTIONS DROPDOWN ----
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

  // ---- INPUT LINE (DISPLAYED IN OUTPUT AREA) ----
  const inputLine = React.createElement('div', {
    className: 'terminal-line command',
    style: { display: 'flex', alignItems: 'center' }
  },
    React.createElement('span', { className: 'terminal-prompt' }, userName + ' ~ '),
    React.createElement('span', null, input || (loading ? '...' : '')),
    loading && React.createElement('span', { className: 'blinking-cursor' })
  );

  // ---- TYPING INDICATOR ----
  const typingIndicator = showTypingIndicator ? React.createElement('div', { className: 'terminal-line response typing-indicator' },
    'Typing...'
  ) : null;

  // ---- MAIN RENDER ----
  return React.createElement('div', { className: 'terminal', onClick: focusInput },
    // Header
    React.createElement('div', { className: 'terminal-header' },
      React.createElement('span', { className: 'terminal-title' }, 'CP Terminal'),
      React.createElement('div', { className: 'terminal-header-actions' },
        installAvailable && React.createElement('button', {
          className: 'btn-icon',
          title: 'Install App',
          onClick: () => executeCommand('install')
        }, React.createElement('i', { className: 'ph ph-download-simple' })),
        React.createElement('button', {
          className: 'btn-icon',
          title: 'Clear terminal',
          onClick: () => { if (history.length > 2) setShowClearConfirm(true); else { setHistory([]); setInput(''); } }
        }, React.createElement('i', { className: 'ph ph-broom' }))
      )
    ),

    // Output area
    React.createElement('div', { className: 'terminal-output', ref: outputRef },
      ...outputElements,
      inputLine,
      typingIndicator,
      clearConfirmDialog,
      suggestionList
    ),

    // Input area
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
        onClick: () => executeCommand(input),
        disabled: loading || !input.trim(),
        style: { marginLeft: '8px', padding: '10px 16px', borderRadius: '12px' }
      }, React.createElement('i', { className: 'ph ph-paper-plane-right' }))
    ),

    // Animations
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
      .typing-indicator {
        opacity: 0.7;
        font-style: italic;
        animation: fadeIn 0.3s ease;
      }
      .terminal-suggestions {
        position: absolute;
        bottom: 100%;
        left: 0;
        width: 100%;
        max-height: 150px;
        overflow-y: auto;
        z-index: 10;
        padding: 8px;
        border-radius: 12px 12px 0 0;
      }
      .suggestion-item {
        padding: 4px 8px;
        cursor: pointer;
        border-radius: 6px;
        transition: background 0.2s;
      }
      .suggestion-item:hover,
      .suggestion-item.selected {
        background: var(--surface-hover);
      }
      .terminal-clear-confirm {
        padding: 16px;
        margin: 8px 0;
        border-radius: 12px;
      }
      .terminal-header-actions {
        display: flex;
        gap: 8px;
      }
    `)
  );
                                                 }
