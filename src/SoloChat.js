import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useUser } from './UserContext.js';
import { useToast } from './ToastContext.js';
import { MOVIE_API_KEY } from './config.js';

export default function SoloChat() {
  const currentUser = useUser();
  const { addToast } = useToast();
  const userName = useMemo(() => currentUser?.displayName || currentUser?.email || 'guest', [currentUser]);

  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem('cp-terminal-history');
    return saved ? JSON.parse(saved) : [{ type: 'response', text: 'Welcome to CP Terminal. Type "help" to get started.' }];
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

  useEffect(() => { localStorage.setItem('cp-terminal-history', JSON.stringify(history.slice(-200))); }, [history]);
  useEffect(() => { localStorage.setItem('cp-command-history', JSON.stringify(commandHistory.slice(-100))); }, [commandHistory]);
  useEffect(() => { localStorage.setItem('cp-aliases', JSON.stringify(aliases)); }, [aliases]);
  useEffect(() => { outputRef.current?.scrollTo(0, outputRef.current.scrollHeight); }, [history]);
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); deferredPromptRef.current = e; setInstallAvailable(true); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const allCommands = useMemo(() => [
    'help','clear','time','date','echo','whoami','version','calc',
    'weather','define','crypto','joke','news','qr','ip','fact',
    'randomuser','timezone','currency','lyrics','movie','install',
    'trivia','advice','catfact','quote','numberfact',
    'alias','unalias','aliases','history','export','cowsay',
    'fortune','sudo','uptime','ping','figlet', ...Object.keys(aliases)
  ], [aliases]);

  const commandHelp = useMemo(() => ({
    help:'Show all commands', clear:'Clear the terminal', time:'Current time', date:'Today\'s date',
    weather:'Get weather for a city', define:'Define a word', crypto:'Crypto price', joke:'Random joke',
    news:'Latest headlines', qr:'Generate QR code', ip:'Your public IP', fact:'Random fact',
    randomuser:'Random user profile', timezone:'Current time in a timezone', currency:'Convert currency',
    lyrics:'Fetch song lyrics', movie:'Movie info', install:'Install app as PWA',
    trivia:'Random trivia question', advice:'Get a piece of advice', catfact:'Random cat fact',
    quote:'Inspirational quote', numberfact:'Interesting number fact',
    alias:'Create command alias', unalias:'Remove alias', aliases:'List all aliases',
    history:'Command history', export:'Export terminal log', cowsay:'Make a cow say something',
    fortune:'Random fortune', sudo:'Simulated root access', uptime:'Simulated uptime',
    ping:'Simulated ping', figlet:'ASCII art text'
  }), []);

  const focusInput = () => inputRef.current?.focus();
  useEffect(() => { focusInput(); }, []);

  const fetchWithTimeout = (url, timeout = 5000) => Promise.race([fetch(url), new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), timeout))]);

  const formatResponse = (text) => `[${new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}] ${text}`;

  const executeCommand = useCallback(async (rawCmd) => {
    const trimmed = rawCmd.trim();
    if (!trimmed) return;
    const newHistory = [...history, { type: 'command', text: `> ${trimmed}` }];
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
              const res = await fetchWithTimeout(`https://wttr.in/${encodeURIComponent(city)}?format=%C+%t+%w`);
              if (!res.ok) throw new Error('City not found');
              const text = await res.text();
              if (text.trim().startsWith('<')) throw new Error('Invalid response');
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

    // Local commands (same as before, but with new help entry)
    let response = ''; let isError = false;
    switch (main) {
      case 'help': {
        const entries = Object.entries(commandHelp);
        const pageSize = 8; let page = 1;
        if (args.length === 2 && args[0] === 'page') { page = parseInt(args[1],10) || 1; }
        const start = (page-1)*pageSize;
        const pageEntries = entries.slice(start, start+pageSize);
        response = pageEntries.length ? `Commands (Page ${page}/${Math.ceil(entries.length/pageSize)})\n\n` + pageEntries.map(([c,d]) => `  ${c.padEnd(14)} ${d}`).join('\n') : `No more commands.`;
        break;
      }
      // ... (rest of local commands identical to previous polished version, include install, time, date, echo, whoami, version, calc, quote, history, export, cowsay, fortune, sudo, uptime, ping, figlet, alias, unalias, aliases)
      default: response = `Command not found: ${main}. Type "help".`; isError = true;
    }
    setHistory([...newHistory, { type: isError ? 'error' : 'response', text: formatResponse(response) }]);
    setInput('');
  }, [history, aliases, showClearConfirm, userName, commandHelp, installAvailable]);

  // … (remaining identical render logic, including clear confirm, suggestions, input area, etc.)
  // The render is unchanged except using the toast context for install feedback.
    }
