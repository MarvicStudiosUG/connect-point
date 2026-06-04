import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useUser } from './UserContext.js';
import { MOVIE_API_KEY, WEATHER_API_KEY, MATH_API_ENABLED } from './config.js';
import {
  getVaultNotes,
  createVaultNote,
  updateVaultNote,
  deleteVaultNote,
  verifyVaultPassword,
  setVaultPassword,
} from './db.js';
import { evaluate, simplify, parse, derivative } from 'mathjs'; // Step-by-step math

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

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      deferredPromptRef.current = e;
      setInstallAvailable(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    const handleKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        setShowClearConfirm(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (history.length > 2) setShowClearConfirm(true);
        else {
          setHistory([]);
          setInput('');
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [history]);

  const allCommands = useMemo(
    () => [
      'help', 'clear', 'time', 'date', 'echo', 'whoami', 'version', 'calc',
      'weather', 'define', 'crypto', 'joke', 'news', 'qr', 'ip', 'fact',
      'randomuser', 'timezone', 'currency', 'lyrics', 'movie', 'install',
      'alias', 'unalias', 'aliases', 'quote', 'history', 'export', 'cowsay',
      'fortune', 'sudo', 'uptime', 'ping', 'figlet', 'vault',
      'wiki', 'translate', 'cheat', 'reddit', 'shorten', 'kanye', 'roll', 'flip', 'country',
      'math', 'solve', // Added 'solve' as alias for advanced math
      ...Object.keys(aliases),
    ],
    [aliases]
  );

  // Clean, categorized help
  const commandCategories = useMemo(
    () => ({
      '🛠️ General': {
        help: 'Show all commands',
        clear: 'Clear the terminal',
        echo: 'Print text (echo hello)',
        whoami: 'Show your username',
        version: 'Terminal version',
        history: 'Show command history',
        export: 'Export terminal log as file',
        alias: 'Create alias (alias w weather)',
        unalias: 'Remove alias (unalias w)',
        aliases: 'List all aliases',
      },
      '⏰ System': {
        time: 'Current time',
        date: "Today's date",
        calc: 'Basic calculation (calc 2+3)',
        math: 'Advanced math with steps (math sin(45) + 5)',
        solve: 'Alias for math',
        uptime: 'Simulated uptime',
        ping: 'Simulated ping (ping google.com)',
      },
      '🌐 Network & Data': {
        weather: 'Weather forecast (weather Kampala)',
        define: 'Define a word (define hello)',
        crypto: 'Crypto price (crypto bitcoin)',
        news: 'Latest headlines (news or news tech)',
        ip: 'Your public IP',
        timezone: 'Time in timezone (timezone Europe/London)',
        currency: 'Convert currency (currency 100 USD EUR)',
        qr: 'Generate QR code (qr https://example.com)',
        shorten: 'Shorten URL (shorten https://example.com)',
        country: 'Country info (country Uganda)',
      },
      '🎮 Fun & Entertainment': {
        joke: 'Random joke',
        fact: 'Random fact',
        randomuser: 'Random user profile',
        quote: 'Inspirational quote',
        cowsay: 'Cow says something (cowsay Hello)',
        fortune: 'Random fortune cookie',
        figlet: 'ASCII art (figlet Hello)',
        kanye: 'Random Kanye West quote',
        roll: 'Roll a dice (roll 6)',
        flip: 'Flip a coin',
      },
      '📚 Knowledge': {
        wiki: 'Wikipedia summary (wiki Python)',
        cheat: 'Cheat sheet for commands (cheat git)',
        translate: 'Translate text (translate en es Hello)',
      },
      '🎬 Media': {
        movie: 'Movie info (movie Inception)',
        lyrics: 'Song lyrics (lyrics Queen Bohemian Rhapsody)',
        reddit: 'Top posts from subreddit (reddit programming)',
      },
      '🔐 Vault': {
        vault: 'Manage vault (vault list <password>)',
      },
      '📦 PWA': {
        install: 'Install this app as PWA',
      },
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

      if (aliases[main]) {
        const expansion = aliases[main].split(/\s+/);
        main = expansion[0].toLowerCase();
        args = expansion.slice(1).concat(args);
      }

      // Clear
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
        'wiki', 'translate', 'cheat', 'reddit', 'shorten', 'kanye', 'country'
      ];
      if (cloudCmds.includes(main)) {
        setLoading(true);
        setHistory([...newHistory, { type: 'response', text: 'Fetching...' }]);
        setInput('');
        try {
          let result = '';
          switch (main) {
            // --- WEATHER (with your API key) ---
            case 'weather': {
              if (!args[0]) {
                result = 'Usage: weather <city> [country code] e.g., weather Kampala';
                break;
              }
              const location = args.join(' ');
              try {
                // Use OpenWeatherMap with your key
                const res = await fetchWithTimeout(
                  `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${WEATHER_API_KEY}&units=metric`
                );
                if (!res.ok) throw new Error('City not found');
                const data = await res.json();
                const temp = data.main.temp;
                const desc = data.weather[0].description;
                const feelsLike = data.main.feels_like;
                const humidity = data.main.humidity;
                result = `🌤️ Weather in ${data.name}, ${data.sys.country}: ${temp}°C, ${desc}. Feels like ${feelsLike}°C, ${humidity}% humidity.`;
              } catch (e) {
                result = `Could not fetch weather for "${location}". Please check the city name.`;
                throw new Error(result);
              }
              break;
            }

            // --- ADVANCED MATH WITH STEP-BY-STEP ---
            case 'math':
            case 'solve': {
              if (!args[0]) {
                result = 'Usage: math <expression> e.g., math sin(45) + 5';
                break;
              }
              const expr = args.join(' ');
              try {
                // Step 1: Parse the expression
                const node = parse(expr);
                // Step 2: Try to simplify
                let simplified = 'No simplification available';
                try {
                  const simpResult = simplify(node);
                  simplified = simpResult.toString();
                } catch {
                  // ignore
                }
                // Step 3: Evaluate
                const evaluated = evaluate(expr);
                // Step 4: Derivative (if derivative is requested, e.g., math derivative(x^2))
                let derivativeStep = '';
                if (expr.includes('derivative')) {
                  const derivNode = derivative(expr.replace('derivative(', '').replace(')', ''), 'x');
                  derivativeStep = `Derivative: ${derivNode.toString()}\n`;
                }
                result = `📐 Step-by-step:\n`;
                if (simplified && simplified !== expr) {
                  result += `  Simplify: ${simplified}\n`;
                }
                result += derivativeStep;
                result += `  Evaluate: ${evaluated}\n`;
                result += `  Expression: ${expr}`;
              } catch (e) {
                result = 'Error: Invalid math expression. Try: math sin(45) + 5, math derivative(x^2)';
              }
              break;
            }

            // --- WIKIPEDIA ---
            case 'wiki': {
              if (!args[0]) { result = 'Usage: wiki <topic>'; break; }
              const topic = args.join(' ');
              const res = await fetchWithTimeout(
                `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`
              );
              if (!res.ok) throw new Error('Topic not found');
              const data = await res.json();
              if (data.extract) {
                let summary = data.extract;
                if (summary.length > 300) summary = summary.slice(0, 300) + '...';
                result = `📖 ${data.title}\n${summary}`;
              } else {
                throw new Error('No summary available');
              }
              break;
            }

            // --- TRANSLATE ---
            case 'translate': {
              if (args.length < 3) {
                result = 'Usage: translate <from> <to> <text> e.g., translate en es Hello';
                break;
              }
              const from = args[0];
              const to = args[1];
              const text = args.slice(2).join(' ');
              const res = await fetchWithTimeout(
                `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`
              );
              const data = await res.json();
              if (data.responseData) {
                result = `🔁 ${data.responseData.translatedText}`;
              } else {
                throw new Error('Translation failed');
              }
              break;
            }

            // --- CHEAT SHEET ---
            case 'cheat': {
              if (!args[0]) { result = 'Usage: cheat <command> e.g., cheat git'; break; }
              const command = args[0];
              const res = await fetchWithTimeout(`https://cheat.sh/${encodeURIComponent(command)}`);
              const text = await res.text();
              if (text.length > 1000) {
                result = `📖 ${command}\n${text.slice(0, 1000)}\n... (truncated)`;
              } else {
                result = `📖 ${command}\n${text}`;
              }
              break;
            }

            // --- REDDIT ---
            case 'reddit': {
              if (!args[0]) { result = 'Usage: reddit <subreddit>'; break; }
              const sub = args[0];
              const res = await fetchWithTimeout(`https://www.reddit.com/r/${encodeURIComponent(sub)}/top.json?limit=5`);
              if (!res.ok) throw new Error('Subreddit not found');
              const data = await res.json();
              if (data.data && data.data.children.length > 0) {
                let posts = `Top 5 posts from r/${sub}:\n`;
                data.data.children.forEach((post, i) => {
                  posts += `${i+1}. ${post.data.title} (${post.data.ups} upvotes)\n`;
                });
                result = posts;
              } else {
                result = 'No posts found.';
              }
              break;
            }

            // --- URL SHORTENER ---
            case 'shorten': {
              if (!args[0]) { result = 'Usage: shorten <url>'; break; }
              const longUrl = args[0];
              const res = await fetchWithTimeout(
                `https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`
              );
              const text = await res.text();
              if (text.startsWith('http')) {
                result = `🔗 Shortened: ${text}`;
              } else {
                throw new Error('Failed to shorten URL');
              }
              break;
            }

            // --- COUNTRY INFO ---
            case 'country': {
              if (!args[0]) { result = 'Usage: country <name>'; break; }
              const name = args.join(' ');
              const res = await fetchWithTimeout(`https://restcountries.com/v3.1/name/${encodeURIComponent(name)}`);
              if (!res.ok) throw new Error('Country not found');
              const data = await res.json();
              if (data.length > 0) {
                const country = data[0];
                result = `🌍 ${country.name.common}\nCapital: ${country.capital ? country.capital[0] : 'N/A'}\nPopulation: ${country.population.toLocaleString()}\nCurrency: ${Object.values(country.currencies)[0].name}`;
              } else {
                result = 'No country found.';
              }
              break;
            }

            // --- KANYE ---
            case 'kanye': {
              const res = await fetchWithTimeout('https://api.kanye.rest');
              const data = await res.json();
              result = `💬 ${data.quote} - Kanye West`;
              break;
            }

            // --- FLIP ---
            case 'flip': {
              result = Math.random() > 0.5 ? '🪙 Heads' : '🪙 Tails';
              break;
            }

            // --- ROLL ---
            case 'roll': {
              let sides = 6;
              if (args[0] && !isNaN(args[0])) {
                sides = parseInt(args[0]);
              }
              const roll = Math.floor(Math.random() * sides) + 1;
              result = `🎲 You rolled a ${roll} on a d${sides}`;
              break;
            }

            // --- OLD CLOUD CMDS ---
            case 'define': {
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
            }
            case 'crypto': {
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
            }
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
            case 'qr': {
              if (!args[0]) result = 'Usage: qr <text or url>';
              else
                result = `QR Code: https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(args.join(' '))}`;
              break;
            }
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
            case 'timezone': {
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
            }
            case 'currency': {
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
            }
            case 'lyrics': {
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
                  if (result.length > 2000) {
                    result = `<div class="long-output">${result}</div>`;
                  }
                } else result = 'No lyrics found.';
              }
              break;
            }
            case 'movie': {
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
            default:
              result = `Unhandled cloud command: ${main}`;
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

      // ---- VAULT COMMANDS (unchanged) ----
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
            case 'view': {
              if (rest.length < 1) {
                result = 'Usage: vault view <password> <noteId>';
                break;
              }
              const noteId = rest[0];
              const notes = await getVaultNotes(currentUser.uid);
              const note = notes.find((n) => n.id === noteId);
              if (!note) {
                result = 'Note not found.';
              } else {
                result = `Title: ${note.title}\n\nContent:\n${note.content}`;
              }
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
              result = `Unknown vault action: ${action}. Try: list, view, add, edit, delete, setpass.`;
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

      // ---- LOCAL COMMANDS (unchanged) ----
      let response = '';
      let isError = false;
      switch (main) {
        case 'help': {
          let helpText = '📋 **Terminal Commands**\n\n';
          Object.entries(commandCategories).forEach(([category, cmds]) => {
            helpText += `**${category}**\n`;
            Object.entries(cmds).forEach(([cmd, desc]) => {
              helpText += `  ${cmd.padEnd(12)} ${desc}\n`;
            });
            helpText += '\n';
          });
          helpText += '**✨ Tips**\n  Use `alias <short> <command>` to create shortcuts.\n  Use `history` to see past commands.\n  Use `export` to save the log.';
          response = helpText;
          break;
        }
        case 'install': {
          if (deferredPromptRef.current) {
            try {
              deferredPromptRef.current.prompt();
              const { outcome } = await deferredPromptRef.current.userChoice;
              response = outcome === 'accepted' ? 'App installation started.' : 'Installation cancelled.';
              deferredPromptRef.current = null;
              setInstallAvailable(false);
            } catch {
              response = 'Install failed.';
            }
          } else if (installAvailable) response = 'Install prompt ready. Try again.';
          else response = 'Install not available. Tap browser menu and select "Add to Home screen".';
          break;
        }
        case 'time': response = new Date().toLocaleTimeString(); break;
        case 'date': response = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); break;
        case 'echo': response = args.join(' '); break;
        case 'whoami': response = userName; break;
        case 'version': response = 'CP Terminal v3.4 – Smart Math & Weather'; break;
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
        case 'quote': response = '"The only way to do great work is to love what you do." – Steve Jobs'; break;
        case 'history': {
          const list = commandHistory.map((c, i) => `${i + 1}. ${c}`).join('\n');
          response = list ? `Command History:\n${list}` : 'No commands yet.';
          break;
        }
        case 'export': {
          const log = history.map((entry) => entry.type === 'command' ? entry.text : `[${entry.type}] ${entry.text}`).join('\n');
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
          const fortunes = ['The early bird gets the worm...', 'A journey of a thousand miles...', 'All that glitters is not gold.', 'Actions speak louder than words.'];
          response = `Fortune: ${fortunes[Math.floor(Math.random() * fortunes.length)]}`;
          break;
        }
        case 'sudo': response = 'Sorry, you are not root.'; break;
        case 'uptime': response = `Uptime: ${Math.floor(Math.random() * 10000) + 100} hours (simulated)`; break;
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
          const ascii = text.toUpperCase().split('').map((ch) => (ch === ' ' ? '  ' : ch + ' ')).join(' ');
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
          response = list.length ? 'Aliases:\n' + list.map(([k, v]) => `  ${k} -> ${v}`).join('\n') : 'No aliases set.';
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
      commandCategories,
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
        setSelectedSuggestion(0);
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
        setSelectedSuggestion((prev) => prev <= 0 ? suggestions.length - 1 : prev - 1);
      } else {
        const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        if (commandHistory[newIndex]) setInput(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (suggestions.length > 0) {
        setSelectedSuggestion((prev) => prev >= suggestions.length - 1 ? 0 : prev + 1);
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
      executeCommand(input);
    }
  };

  const header = React.createElement(
    'div', { className: 'terminal-header' },
    React.createElement('span', { className: 'terminal-title' }, 'CP Terminal'),
    React.createElement('div', { className: 'terminal-header-actions' },
      React.createElement('button', {
        className: 'btn-icon',
        onClick: () => executeCommand('install'),
        title: 'Install App',
        'aria-label': 'Install App',
        disabled: !installAvailable,
      }, React.createElement('i', { className: 'ph ph-download-simple' })),
      React.createElement('button', {
        className: 'btn-icon',
        onClick: () => {
          if (history.length > 2) setShowClearConfirm(true);
          else {
            setHistory([]);
            setInput('');
          }
        },
        title: 'Clear terminal (Ctrl+L)',
        'aria-label': 'Clear terminal',
      }, React.createElement('i', { className: 'ph ph-broom' }))
    )
  );

  const outputElements = history.map((entry, idx) => {
    const isHTML = entry.type === 'response' && entry.text.includes('<div class="long-output">');
    return React.createElement(
      'div',
      {
        key: idx,
        className: `terminal-line ${entry.type}${entry.type === 'response' ? ' response-card' : ''}`,
        dangerouslySetInnerHTML: isHTML ? { __html: entry.text } : undefined,
      },
      isHTML ? null : entry.text
    );
  });

  const clearConfirmDialog = showClearConfirm ? React.createElement(
    'div', { className: 'modal-overlay' },
    React.createElement('div', { className: 'modal-box' },
      React.createElement('p', null, 'Clear the terminal?'),
      React.createElement('div', { className: 'btn-group' },
        React.createElement('button', { className: 'btn btn-primary', onClick: () => confirmClear(true) }, 'Yes'),
        React.createElement('button', { className: 'btn btn-secondary', onClick: () => confirmClear(false) }, 'No')
      )
    )
  ) : null;

  const suggestionList = suggestions.length > 0 ? React.createElement(
    'div', { className: 'terminal-suggestions', role: 'listbox', 'aria-activedescendant': `suggestion-${selectedSuggestion}` },
    suggestions.map((s, i) => React.createElement(
      'div', {
        key: s,
        id: `suggestion-${i}`,
        className: `suggestion-item${i === selectedSuggestion ? ' selected' : ''}`,
        onMouseDown: () => {
          setInput(s + ' ');
          setSuggestions([]);
          setSelectedSuggestion(-1);
          inputRef.current.focus();
        },
        role: 'option',
        'aria-selected': i === selectedSuggestion,
      }, s
    ))
  ) : null;

  const historyIndicator = historyIndex >= 0 && historyIndex < commandHistory.length ? React.createElement(
    'span', { className: 'history-indicator' },
    `(${historyIndex + 1}/${commandHistory.length})`
  ) : null;

  const inputArea = React.createElement(
    'div', { className: 'terminal-input-area' },
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
      'aria-label': 'Terminal input',
    }),
    historyIndicator,
    loading && React.createElement('span', { className: 'spinner' }),
    React.createElement('button', {
      className: 'btn btn-primary send-btn',
      onClick: () => executeCommand(input),
      disabled: loading || !input.trim(),
      'aria-label': 'Execute command',
    }, React.createElement('i', { className: 'ph ph-paper-plane-right' }))
  );

  return React.createElement(
    'div', { className: 'terminal', onClick: focusInput, role: 'log', 'aria-live': 'polite' },
    header,
    React.createElement('div', { className: 'terminal-output', ref: outputRef },
      ...outputElements,
      clearConfirmDialog
    ),
    suggestionList,
    inputArea
  );
                   }
