import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useUser } from './UserContext.js';
import { MOVIE_API_KEY } from './config.js';
import {
  getVaultNotes,
  createVaultNote,
  updateVaultNote,
  deleteVaultNote,
  verifyVaultPassword,
  setVaultPassword,
} from './db.js';

export default function SoloChat() {
  const currentUser = useUser();
  const userName = useMemo(
    () => currentUser?.displayName || currentUser?.email || 'guest',
    [currentUser]
  );

  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem('cp-terminal-history');
    return saved
      ? JSON.parse(saved)
      : [{ type: 'response', text: 'Welcome to CP Terminal. Type "help" to get started.' }];
  });
  const [input, setInput] = useState('');
  const [commandHistory, setCommandHistory] = useState(() => {
    const saved = localStorage.getItem('cp-command-history');
    return saved ? JSON.parse(saved) : [];
  });
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [aliases, setAliases] = useState(() =>
    JSON.parse(localStorage.getItem('cp-aliases') || '{}')
  );
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const outputRef = useRef(null);
  const inputRef = useRef(null);
  const deferredPromptRef = useRef(null);
  const [installAvailable, setInstallAvailable] = useState(false);

  // Persist history and aliases
  useEffect(() => {
    localStorage.setItem('cp-terminal-history', JSON.stringify(history.slice(-200)));
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

  // Install prompt listener
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      deferredPromptRef.current = e;
      setInstallAvailable(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const allCommands = useMemo(
    () => [
      'help', 'clear', 'time', 'date', 'echo', 'whoami', 'version', 'calc',
      'weather', 'define', 'crypto', 'joke', 'news', 'qr', 'ip', 'fact',
      'randomuser', 'timezone', 'currency', 'lyrics', 'movie', 'install',
      'alias', 'unalias', 'aliases', 'quote', 'history', 'export', 'cowsay',
      'fortune', 'sudo', 'uptime', 'ping', 'figlet',
      'vault',
      ...Object.keys(aliases),
    ],
    [aliases]
  );

  const commandHelp = useMemo(
    () => ({
      help: 'Show all commands',
      clear: 'Clear the terminal',
      time: 'Current time',
      date: "Today's date",
      echo: 'Print text (echo hello)',
      whoami: 'Show your username',
      version: 'Terminal version',
      calc: 'Calculate expression (calc 2+3*4)',
      weather: 'Weather forecast (weather London)',
      define: 'Define a word (define hello)',
      crypto: 'Crypto price (crypto bitcoin)',
      joke: 'Random joke',
      news: 'Latest headlines (news or news tech)',
      qr: 'Generate QR code (qr https://example.com)',
      ip: 'Your public IP',
      fact: 'Random fact',
      randomuser: 'Random user profile',
      timezone: 'Time in timezone (timezone Europe/London)',
      currency: 'Convert currency (currency 100 USD EUR)',
      lyrics: 'Song lyrics (lyrics Queen Bohemian Rhapsody)',
      movie: 'Movie info (movie Inception)',
      install: 'Install this app as PWA',
      alias: 'Create alias (alias w weather)',
      unalias: 'Remove alias (unalias w)',
      aliases: 'List all aliases',
      quote: 'Inspirational quote',
      history: 'Show command history',
      export: 'Export terminal log as file',
      cowsay: 'Cow says something (cowsay Hello)',
      fortune: 'Random fortune cookie',
      sudo: 'Simulated root access',
      uptime: 'Simulated uptime',
      ping: 'Simulated ping (ping google.com)',
      figlet: 'ASCII art (figlet Hello)',
      vault: 'Manage vault (vault list <password>, vault add <password> "title" "content", vault edit <password> <id> "new content", vault delete <password> <id>, vault setpass <oldPassword> <newPassword>)',
    }),
    []
  );

  const focusInput = () => inputRef.current?.focus();
  useEffect(() => {
    focusInput();
  }, []);

  const fetchWithTimeout = (url, timeout = 5000) =>
    Promise.race([
      fetch(url),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out')), timeout)
      ),
    ]);

  const formatResponse = (text) =>
    `[${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}] ${text}`;

  // ---- EXECUTE COMMAND ----
  const executeCommand = useCallback(
    async (rawCmd) => {
      const trimmed = rawCmd.trim();
      if (!trimmed) return;

      const newHistory = [...history, { type: 'command', text: `> ${trimmed}` }];
      setCommandHistory((prev) => [...prev, trimmed]);
      setHistoryIndex(-1);
      setSuggestions([]);
      setSelectedSuggestion(-1);

      let parts = trimmed.split(/\s+/);
      let main = parts[0].toLowerCase();
      let args = parts.slice(1);

      // Resolve alias
      if (aliases[main]) {
        const expansion = aliases[main].split(/\s+/);
        main = expansion[0].toLowerCase();
        args = expansion.slice(1).concat(args);
      }

      if (main === 'clear') {
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
      const cloudCmds = [
        'weather', 'define', 'crypto', 'joke', 'news', 'qr', 'ip',
        'fact', 'randomuser', 'timezone', 'currency', 'lyrics', 'movie',
      ];
      if (cloudCmds.includes(main)) {
        setLoading(true);
        setHistory([...newHistory, { type: 'response', text: 'Fetching...' }]);
        setInput('');
        try {
          let result = '';
          switch (main) {
            case 'weather':
              if (!args[0]) result = 'Usage: weather <city>';
              else {
                const city = args.join(' ');
                const res = await fetchWithTimeout(
                  `https://wttr.in/${encodeURIComponent(city)}?format=%C+%t+%w`
                );
                if (!res.ok) throw new Error('City not found');
                const text = await res.text();
                if (text.trim().startsWith('<'))
                  throw new Error('Invalid response');
                result = `Weather in ${city}: ${text.trim()}`;
              }
              break;
            case 'define':
              if (!args[0]) result = 'Usage: define <word>';
              else {
                const res = await fetchWithTimeout(
                  `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(args[0])}`
                );
                if (!res.ok) throw new Error('Word not found');
                const data = await res.json();
                const e = data[0];
                let defs = '';
                e.meanings.slice(0, 2).forEach((m) => {
                  defs += `  ${m.partOfSpeech}: ${m.definitions[0].definition}\n`;
                });
                result = `Definition: ${e.word}\n${defs.trim()}`;
              }
              break;
            case 'crypto':
              if (!args[0]) result = 'Usage: crypto <coin_id>';
              else {
                const res = await fetchWithTimeout(
                  `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(args[0])}&vs_currencies=usd`
                );
                if (!res.ok) throw new Error('Coin not found');
                const data = await res.json();
                if (!data[args[0]]) throw new Error('Coin not found');
                result = `Price: ${args[0].toUpperCase()} = $${data[args[0]].usd}`;
              }
              break;
            case 'joke': {
              const res = await fetchWithTimeout(
                'https://official-joke-api.appspot.com/random_joke'
              );
              if (!res.ok) throw new Error('Joke fetch failed');
              const d = await res.json();
              result = `${d.setup}\n   ${d.punchline}`;
              break;
            }
            case 'news': {
              try {
                const topic = args[0] || 'general';
                const res = await fetchWithTimeout(
                  `https://inshortsapi.vercel.app/news?category=${topic}`
                );
                if (!res.ok) throw new Error('News unavailable');
                const data = await res.json();
                if (!data.data || data.data.length === 0) {
                  result = 'No news found for this category.';
                } else {
                  result = `Top ${topic} headlines:\n`;
                  data.data.slice(0, 5).forEach((article, i) => {
                    result += `${i + 1}. ${article.title}\n`;
                  });
                }
              } catch {
                result = 'News feed unavailable. Try again later.';
              }
              break;
            }
            case 'qr':
              if (!args[0]) result = 'Usage: qr <text or url>';
              else
                result = `QR Code: https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(args.join(' '))}`;
              break;
            case 'ip': {
              const res = await fetchWithTimeout('https://api.ipify.org?format=json');
              const data = await res.json();
              result = `Your IP: ${data.ip}`;
              break;
            }
            case 'fact': {
              const res = await fetchWithTimeout(
                'https://uselessfacts.jsph.pl/random.json?language=en'
              );
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
            case 'timezone':
              if (!args[0]) result = 'Usage: timezone <area>/<city>';
              else {
                const res = await fetchWithTimeout(
                  `https://worldtimeapi.org/api/timezone/${encodeURIComponent(args[0])}`
                );
                if (!res.ok) throw new Error('Invalid timezone');
                const data = await res.json();
                result = `Timezone: ${data.timezone} - ${data.datetime.split('T')[1].split('.')[0]}`;
              }
              break;
            case 'currency':
              if (args.length < 3)
                result = 'Usage: currency <amount> <from> <to> (e.g., currency 100 USD EUR)';
              else {
                const amount = args[0];
                const from = args[1].toUpperCase();
                const to = args[2].toUpperCase();
                const res = await fetchWithTimeout(
                  `https://api.exchangerate.host/convert?from=${from}&to=${to}&amount=${amount}`
                );
                if (!res.ok) throw new Error('Conversion failed');
                const data = await res.json();
                result = `Conversion: ${amount} ${from} = ${data.result} ${to}`;
              }
              break;
            case 'lyrics':
              if (args.length < 2) result = 'Usage: lyrics <artist> <song>';
              else {
                const artist = args[0];
                const song = args.slice(1).join(' ');
                const res = await fetchWithTimeout(
                  `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(song)}`
                );
                if (!res.ok) throw new Error('Lyrics not found');
                const data = await res.json();
                if (data.lyrics) {
                  result = `Lyrics: ${song} by ${artist}\n\n${data.lyrics}`;
                  if (result.length > 2000)
                    result = result.slice(0, 2000) + '\n... (truncated)';
                } else result = 'No lyrics found.';
              }
              break;
            case 'movie':
              if (!args[0]) result = 'Usage: movie <title>';
              else {
                const apiKey = MOVIE_API_KEY || 'trilogy';
                const res = await fetchWithTimeout(
                  `https://www.omdbapi.com/?t=${encodeURIComponent(args.join(' '))}&apikey=${apiKey}`
                );
                if (!res.ok) throw new Error('Movie not found');
                const data = await res.json();
                if (data.Error) throw new Error(data.Error);
                result = `Movie: ${data.Title} (${data.Year})\nRating: ${data.imdbRating}\nPlot: ${data.Plot}`;
              }
              break;
          }
          setHistory((prev) => [
            ...prev.slice(0, -1),
            { type: 'response', text: formatResponse(result) },
          ]);
        } catch (err) {
          setHistory((prev) => [
            ...prev.slice(0, -1),
            { type: 'error', text: formatResponse('Error: ' + err.message) },
          ]);
        }
        setLoading(false);
        return;
      }

      // ---- VAULT COMMANDS ----
      if (main === 'vault') {
        if (args.length === 0) {
          const entry = {
            type: 'error',
            text: formatResponse('Usage: vault <action> [arguments]. Try "help vault".'),
          };
          setHistory([...newHistory, entry]);
          setInput('');
          return;
        }
        const action = args[0].toLowerCase();
        const passArgs = args.slice(1);

        if (action === 'setpass') {
          if (passArgs.length < 2) {
            setHistory([
              ...newHistory,
              {
                type: 'error',
                text: formatResponse('Usage: vault setpass <oldPassword> <newPassword>'),
              },
            ]);
            setInput('');
            return;
          }
          const oldPass = passArgs[0];
          const newPass = passArgs[1];
          const valid = await verifyVaultPassword(currentUser.uid, oldPass);
          if (!valid) {
            setHistory([
              ...newHistory,
              { type: 'error', text: formatResponse('Incorrect old password.') },
            ]);
            setInput('');
            return;
          }
          await setVaultPassword(currentUser.uid, newPass);
          setHistory([
            ...newHistory,
            { type: 'response', text: formatResponse('Vault password updated.') },
          ]);
          setInput('');
          return;
        }

        // All other vault actions require password
        if (passArgs.length === 0) {
          setHistory([
            ...newHistory,
            { type: 'error', text: formatResponse('Vault password required.') },
          ]);
          setInput('');
          return;
        }
        const password = passArgs[0];
        const rest = passArgs.slice(1);
        const valid = await verifyVaultPassword(currentUser.uid, password);
        if (!valid) {
          setHistory([
            ...newHistory,
            { type: 'error', text: formatResponse('Incorrect vault password.') },
          ]);
          setInput('');
          return;
        }

        try {
          let result = '';
          switch (action) {
            case 'list': {
              const notes = await getVaultNotes(currentUser.uid);
              if (notes.length === 0) result = 'Vault is empty.';
              else
                result =
                  'Vault notes:\n' +
                  notes
                    .map((n, i) => `${i + 1}. ${n.title} (id: ${n.id})`)
                    .join('\n');
              break;
            }
            case 'add': {
              const argsStr = rest.join(' ');
              const match = argsStr.match(/^"(.+?)"\s*"([\s\S]*?)"$/);
              if (!match) {
                result = 'Usage: vault add <password> "title" "content"';
                break;
              }
              await createVaultNote(currentUser.uid, match[1], match[2]);
              result = `Note "${match[1]}" added.`;
              break;
            }
            case 'edit': {
              if (rest.length < 2) {
                result = 'Usage: vault edit <password> <noteId> "new content"';
                break;
              }
              const noteId = rest[0];
              const newContent = rest.slice(1).join(' ').replace(/^"|"$/g, '');
              await updateVaultNote(currentUser.uid, noteId, { content: newContent });
              result = `Note ${noteId} updated.`;
              break;
            }
            case 'delete': {
              if (rest.length < 1) {
                result = 'Usage: vault delete <password> <noteId>';
                break;
              }
              await deleteVaultNote(currentUser.uid, rest[0]);
              result = `Note ${rest[0]} deleted.`;
              break;
            }
            default:
              result = `Unknown vault action: ${action}. Try: list, add, edit, delete, setpass.`;
          }
          setHistory([
            ...newHistory,
            { type: 'response', text: formatResponse(result) },
          ]);
        } catch (err) {
          setHistory([
            ...newHistory,
            { type: 'error', text: formatResponse('Error: ' + err.message) },
          ]);
        }
        setInput('');
        return;
      }

      // ---- LOCAL COMMANDS ----
      let response = '';
      let isError = false;
      switch (main) {
        case 'help': {
          const entries = Object.entries(commandHelp);
          const pageSize = 8;
          let page = 1;
          if (args.length === 2 && args[0] === 'page') {
            page = parseInt(args[1], 10) || 1;
          }
          const start = (page - 1) * pageSize;
          const pageEntries = entries.slice(start, start + pageSize);
          if (pageEntries.length === 0) {
            response = `No more commands. (Page ${page})`;
          } else {
            let helpText = `Commands (Page ${page}/${Math.ceil(entries.length / pageSize)})\n\n`;
            pageEntries.forEach(([cmd, desc]) => {
              helpText += `  ${cmd.padEnd(14)} ${desc}\n`;
            });
            helpText += '\nFor detailed help on a command, type "help <command>".';
            response = helpText;
          }
          break;
        }
        case 'install':
          if (deferredPromptRef.current) {
            try {
              deferredPromptRef.current.prompt();
              const { outcome } = await deferredPromptRef.current.userChoice;
              response =
                outcome === 'accepted'
                  ? 'App installation started.'
                  : 'Installation cancelled.';
              deferredPromptRef.current = null;
              setInstallAvailable(false);
            } catch {
              response = 'Install failed.';
            }
          } else if (installAvailable) response = 'Install prompt ready. Try again.';
          else
            response =
              'Install not available. Tap browser menu and select "Add to Home screen".';
          break;
        case 'time':
          response = new Date().toLocaleTimeString();
          break;
        case 'date':
          response = new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
          break;
        case 'echo':
          response = args.join(' ');
          break;
        case 'whoami':
          response = userName;
          break;
        case 'version':
          response = 'CP Terminal v3.2 – Vault Edition';
          break;
        case 'calc': {
          try {
            const expr = args.join('');
            if (!expr) throw new Error('No expression');
            const sanitized = expr.replace(/[^0-9+\-*/().%\s]/g, '');
            if (sanitized !== expr.replace(/\s/g, '')) throw new Error('Invalid characters');
            const result = Function('"use strict"; return (' + sanitized + ')')();
            if (!isFinite(result)) throw new Error('Invalid calculation');
            response = `= ${result}`;
          } catch (e) {
            response = 'Error: ' + e.message;
            isError = true;
          }
          break;
        }
        case 'quote':
          response =
            '"The only way to do great work is to love what you do." – Steve Jobs';
          break;
        case 'history': {
          const list = commandHistory
            .map((c, i) => `${i + 1}. ${c}`)
            .join('\n');
          response = list ? `Command History:\n${list}` : 'No commands yet.';
          break;
        }
        case 'export': {
          const log = history
            .map((entry) =>
              entry.type === 'command'
                ? entry.text
                : `[${entry.type}] ${entry.text}`
            )
            .join('\n');
          const blob = new Blob([log], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `cp-terminal-log-${new Date().toISOString().slice(0, 10)}.txt`;
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
          ];
          response = `Fortune: ${fortunes[Math.floor(Math.random() * fortunes.length)]}`;
          break;
        }
        case 'sudo':
          response = 'Sorry, you are not root.';
          break;
        case 'uptime':
          response = `Uptime: ${Math.floor(Math.random() * 10000) + 100} hours (simulated)`;
          break;
        case 'ping': {
          if (!args[0]) response = 'Usage: ping <host>';
          else {
            const host = args[0];
            const delay = Math.floor(Math.random() * 150) + 20;
            response = `Pinging ${host} ...\nReply from ${host}: time=${delay}ms (simulated)`;
          }
          break;
        }
        case 'figlet': {
          const text = args.join(' ') || 'Hello';
          const ascii = text
            .toUpperCase()
            .split('')
            .map((ch) => (ch === ' ' ? '  ' : ch + ' '))
            .join(' ');
          response = `ASCII: ${ascii}`;
          break;
        }
        case 'alias': {
          if (args.length < 2) response = 'Usage: alias <short> <command>';
          else {
            const short = args[0];
            const full = args.slice(1).join(' ');
            setAliases((prev) => ({ ...prev, [short]: full }));
            response = `Alias set: ${short} -> ${full}`;
          }
          break;
        }
        case 'unalias': {
          if (!args[0]) response = 'Usage: unalias <short>';
          else {
            const short = args[0];
            if (aliases[short]) {
              setAliases((prev) => {
                const n = { ...prev };
                delete n[short];
                return n;
              });
              response = `Alias removed: ${short}`;
            } else {
              response = `Alias not found: ${short}`;
              isError = true;
            }
          }
          break;
        }
        case 'aliases': {
          const list = Object.entries(aliases);
          response = list.length
            ? 'Aliases:\n' + list.map(([k, v]) => `  ${k} -> ${v}`).join('\n')
            : 'No aliases set.';
          break;
        }
        default:
          response = `Command not found: ${main}. Type "help".`;
          isError = true;
      }

      setHistory([
        ...newHistory,
        { type: isError ? 'error' : 'response', text: formatResponse(response) },
      ]);
      setInput('');
    },
    [
      history,
      aliases,
      showClearConfirm,
      userName,
      commandHelp,
      installAvailable,
      currentUser,
    ]
  );

  const confirmClear = (confirmed) => {
    if (confirmed) {
      setHistory([]);
      setInput('');
    }
    setShowClearConfirm(false);
  };

  // ---- PREDICTOR (UPDATED) ----
  const updateSuggestions = useCallback(
    (value) => {
      const firstWord = value.trim().split(/\s+/)[0]?.toLowerCase() || '';
      if (!firstWord) {
        setSuggestions([]);
        setSelectedSuggestion(-1);
        return;
      }
      const matches = allCommands.filter((cmd) => cmd.startsWith(firstWord));
      if (matches.length === 0) {
        setSuggestions([]);
        setSelectedSuggestion(-1);
      } else {
        setSuggestions(matches);
        setSelectedSuggestion(0); // highlight first
      }
    },
    [allCommands]
  );

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setInput(newValue);
    updateSuggestions(newValue);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      if (suggestions.length > 0) {
        const idx = selectedSuggestion >= 0 ? selectedSuggestion : 0;
        setInput(suggestions[idx] + ' ');
        setSuggestions([]);
        setSelectedSuggestion(-1);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (suggestions.length > 0) {
        setSelectedSuggestion((prev) =>
          prev <= 0 ? suggestions.length - 1 : prev - 1
        );
      } else {
        // Navigate command history
        const newIndex =
          historyIndex === -1
            ? commandHistory.length - 1
            : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        if (commandHistory[newIndex]) setInput(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (suggestions.length > 0) {
        setSelectedSuggestion((prev) =>
          prev >= suggestions.length - 1 ? 0 : prev + 1
        );
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
      // If suggestions are open and the user presses Enter, DO NOT execute – let them pick with Tab
      // Instead, just execute the current input, ignoring suggestions
      executeCommand(input);
    }
  };

  // ---- RENDER ----
  const outputElements = history.map((entry, idx) =>
    React.createElement(
      'div',
      {
        key: idx,
        className: `terminal-line ${entry.type}${entry.type === 'response' ? ' response-card' : ''}`,
      },
      entry.text
    )
  );

  const clearConfirmDialog = showClearConfirm
    ? React.createElement(
        'div',
        { className: 'terminal-clear-confirm glass' },
        React.createElement('p', null, 'Clear the terminal?'),
        React.createElement(
          'div',
          { style: { display: 'flex', gap: '8px', marginTop: '8px' } },
          React.createElement(
            'button',
            { className: 'btn btn-primary', onClick: () => confirmClear(true) },
            'Yes'
          ),
          React.createElement(
            'button',
            { className: 'btn', onClick: () => confirmClear(false) },
            'No'
          )
        )
      )
    : null;

  const suggestionList =
    suggestions.length > 0
      ? React.createElement(
          'div',
          { className: 'terminal-suggestions glass' },
          suggestions.map((s, i) =>
            React.createElement(
              'div',
              {
                key: s,
                className: `suggestion-item${i === selectedSuggestion ? ' selected' : ''}`,
                onMouseDown: () => {
                  setInput(s + ' ');
                  setSuggestions([]);
                  setSelectedSuggestion(-1);
                  inputRef.current.focus();
                },
              },
              s
            )
          )
        )
      : null;

  return React.createElement(
    'div',
    { className: 'terminal', onClick: focusInput },
    React.createElement(
      'div',
      { className: 'terminal-header' },
      React.createElement('span', { className: 'terminal-title' }, 'CP Terminal'),
      React.createElement(
        'div',
        { className: 'terminal-header-actions' },
        installAvailable &&
          React.createElement(
            'button',
            {
              className: 'btn-icon',
              onClick: () => executeCommand('install'),
              title: 'Install App',
            },
            React.createElement('i', { className: 'ph ph-download-simple' })
          ),
        React.createElement(
          'button',
          {
            className: 'btn-icon',
            onClick: () => {
              if (history.length > 2) setShowClearConfirm(true);
              else {
                setHistory([]);
                setInput('');
              }
            },
            title: 'Clear terminal',
          },
          React.createElement('i', { className: 'ph ph-broom' })
        )
      )
    ),
    React.createElement(
      'div',
      { className: 'terminal-output', ref: outputRef },
      ...outputElements,
      React.createElement(
        'div',
        { style: { display: 'flex' } },
        React.createElement('span', { className: 'terminal-prompt' }, userName + ' ~ '),
        React.createElement('span', null, input || (loading ? '...' : '')),
        loading &&
          React.createElement('span', { className: 'blinking-cursor' })
      ),
      clearConfirmDialog
    ),
    suggestionList,
    React.createElement(
      'div',
      { className: 'terminal-input-area' },
      React.createElement('span', { className: 'terminal-prompt' }, userName + ' ~ '),
      React.createElement('input', {
        ref: inputRef,
        type: 'text',
        className: 'terminal-input',
        value: input,
        onChange: handleInputChange,
        onKeyDown: handleKeyDown,
        placeholder: 'Type a command...',
        spellCheck: false,
        autoComplete: 'off',
        autoFocus: true,
        disabled: loading,
      }),
      loading &&
        React.createElement('span', { className: 'spinner', style: { marginLeft: '8px' } }),
      React.createElement(
        'button',
        {
          className: 'btn btn-primary send-btn',
          onClick: () => executeCommand(input),
          disabled: loading || !input.trim(),
        },
        React.createElement('i', { className: 'ph ph-paper-plane-right' })
      )
    ),
    React.createElement('style', null, `
      @keyframes blink { 0%,100%{ opacity:1 } 50%{ opacity:0 } }
      .blinking-cursor { display:inline-block; width:8px; height:1.2em; background:var(--accent-light); margin-left:2px; animation:blink 1s step-end infinite; vertical-align:text-bottom; }
    `)
  );
    }
