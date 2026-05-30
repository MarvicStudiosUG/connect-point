import { useState, useRef, useEffect, useCallback } from 'react';

export default function SoloChat() {
  const [history, setHistory] = useState([
    { type: 'response', text: 'Welcome to CP Terminal. Type "help" to see available commands.' }
  ]);
  const [input, setInput] = useState('');
  const [commandHistory, setCommandHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const outputRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [history]);

  const focusInput = () => {
    if (inputRef.current) inputRef.current.focus();
  };

  // All commands that need an API call (keyless APIs)
  const cloudCommands = ['weather', 'define', 'crypto', 'joke', 'news', 'qr', 'ip'];

  // Helper: fetch with timeout
  const fetchWithTimeout = (url, timeout = 5000) => {
    return Promise.race([
      fetch(url),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), timeout))
    ]);
  };

  const executeCommand = useCallback(async (cmd) => {
    const trimmedCmd = cmd.trim();
    if (!trimmedCmd) return;

    const newHistory = [...history, { type: 'command', text: `$ ${trimmedCmd}` }];
    setCommandHistory(prev => [...prev, trimmedCmd]);
    setHistoryIndex(-1);

    const parts = trimmedCmd.split(/\s+/);
    const mainCmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    // Cloud commands (free APIs, no key)
    if (cloudCommands.includes(mainCmd)) {
      setLoading(true);
      setHistory([...newHistory, { type: 'response', text: '⏳ Fetching...' }]);
      setInput('');
      try {
        let result = '';
        switch (mainCmd) {
          case 'weather':
            if (!args[0]) {
              result = 'Usage: weather <city>';
            } else {
              // wttr.in – free, no key
              const city = args.join(' ');
              const res = await fetchWithTimeout(`https://wttr.in/${encodeURIComponent(city)}?format=%C+%t+%w`);
              if (!res.ok) throw new Error('City not found');
              const text = await res.text();
              result = `🌤 ${city}: ${text.trim()}`;
            }
            break;

          case 'define':
            if (!args[0]) {
              result = 'Usage: define <word>';
            } else {
              const res = await fetchWithTimeout(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(args[0])}`);
              if (!res.ok) throw new Error('Word not found');
              const data = await res.json();
              const entry = data[0];
              let output = `📚 ${entry.word}:\n`;
              entry.meanings.slice(0, 2).forEach(m => {
                output += `  ${m.partOfSpeech}: ${m.definitions[0].definition}\n`;
              });
              result = output.trim();
            }
            break;

          case 'crypto':
            if (!args[0]) {
              result = 'Usage: crypto <coin_id> (e.g., bitcoin)';
            } else {
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
              const data = await res.json();
              result = `😂 ${data.setup}\n   ${data.punchline}`;
            }
            break;

          case 'news':
            // RSS feed from NPR (no key)
            try {
              const res = await fetchWithTimeout('https://feeds.npr.org/1001/rss.xml');
              const text = await res.text();
              const items = text.match(/<title>(?!NPR Topics:)([^<]+)<\/title>/g);
              if (items && items.length > 0) {
                result = '📰 Latest news from NPR:\n';
                items.slice(0, 5).forEach((t, i) => {
                  result += `${i+1}. ${t.replace(/<[^>]+>/g, '')}\n`;
                });
              } else {
                result = 'No news titles found.';
              }
            } catch (e) {
              result = 'News feed unavailable right now.';
            }
            break;

          case 'qr':
            if (!args[0]) {
              result = 'Usage: qr <text or url>';
            } else {
              const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(args.join(' '))}`;
              result = `📱 QR Code generated (open in browser): ${qrUrl}`;
            }
            break;

          case 'ip':
            {
              const res = await fetchWithTimeout('https://api.ipify.org?format=json');
              const data = await res.json();
              result = `🌐 Your public IP: ${data.ip}`;
            }
            break;

          default:
            result = `Command not implemented: ${mainCmd}`;
        }

        setHistory(prev => [...prev.slice(0, -1), { type: 'response', text: result }]);
      } catch (err) {
        setHistory(prev => [...prev.slice(0, -1), { type: 'error', text: `Error: ${err.message}` }]);
      }
      setLoading(false);
      return;
    }

    // Local commands (no internet needed)
    let response = '';
    let isError = false;

    switch (mainCmd) {
      case 'help':
        response = `Available commands:
  help          - Show this help
  clear         - Clear terminal
  time          - Current time
  date          - Current date
  echo <text>   - Print text
  whoami        - Show guest name
  version       - CP Terminal version
  calc <expr>   - Math expression
  weather <city> - Live weather
  define <word>  - Dictionary definition
  crypto <coin>  - Crypto price
  joke           - Random joke
  news           - Latest NPR headlines
  qr <text>      - Generate QR code
  ip             - Your public IP
  quote          - Inspirational quote`;
        break;
      case 'clear':
        setHistory([]);
        setInput('');
        return;
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
        response = 'guest@cp-terminal';
        break;
      case 'version':
        response = 'CP Terminal v2.0 (keyless)';
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
      default:
        response = `Command not found: ${mainCmd}. Type "help".`;
        isError = true;
    }

    setHistory([...newHistory, { type: isError ? 'error' : 'response', text: response }]);
    setInput('');
  }, [history]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      executeCommand(input);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setInput(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex !== -1) {
        const newIndex = historyIndex + 1;
        if (newIndex < commandHistory.length) {
          setHistoryIndex(newIndex);
          setInput(commandHistory[newIndex]);
        } else {
          setHistoryIndex(-1);
          setInput('');
        }
      }
    }
  };

  return (
    <div className="terminal" onClick={focusInput}>
      <div className="terminal-output" ref={outputRef}>
        {history.map((entry, idx) => (
          <div key={idx} className={`terminal-line ${entry.type}`}>
            {entry.text}
          </div>
        ))}
        <div className="terminal-line command" style={{ display: 'flex' }}>
          <span className="terminal-prompt">$</span>
          <span>{input}</span>
          {loading && <span className="blinking-cursor" style={{
            display: 'inline-block', width: '8px', height: '1.2em',
            backgroundColor: 'var(--accent-light)', marginLeft: '2px',
            animation: 'blink 1s step-end infinite', verticalAlign: 'text-bottom'
          }}></span>}
        </div>
      </div>
      <div className="terminal-input-area">
        <span className="terminal-prompt">$</span>
        <input
          ref={inputRef}
          type="text"
          className="terminal-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a command..."
          spellCheck={false}
          autoComplete="off"
          autoFocus
          disabled={loading}
        />
      </div>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}