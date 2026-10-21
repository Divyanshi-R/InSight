export function AIAssistantAvatar({
  isSpeaking = false,
  isRecording = false,
  isSaving = false,
}) {
  const mode = isSpeaking
    ? 'speaking'
    : isRecording
    ? 'listening'
    : isSaving
    ? 'saving'
    : 'ready'

  return (
    <div
      className={`ai-assistant-avatar-frame mode-${mode}`}
      aria-label={`AI Assistant: ${mode}`}
    >
      <svg
        viewBox="0 0 120 120"
        className="ai-assistant-svg"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="avatarBgGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f3effc" />
            <stop offset="100%" stopColor="#e5dcf7" />
          </linearGradient>
          <linearGradient id="blazerGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#25213b" />
            <stop offset="100%" stopColor="#181427" />
          </linearGradient>
          <linearGradient id="skinGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fce5da" />
            <stop offset="100%" stopColor="#f4cebc" />
          </linearGradient>
          <linearGradient id="hairGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3d2f28" />
            <stop offset="100%" stopColor="#241b16" />
          </linearGradient>
        </defs>

        {/* Studio Background Circle */}
        <circle cx="60" cy="60" r="56" fill="url(#avatarBgGrad)" />

        {/* Restrained Halo Border Ring */}
        <circle
          cx="60"
          cy="60"
          r="55"
          fill="none"
          className="avatar-halo-ring"
        />

        {/* Torso & Professional Blazer */}
        <path
          d="M24 116 C24 95 36 86 60 86 C84 86 96 95 96 116 Z"
          fill="url(#blazerGrad)"
        />

        {/* Collared Shirt */}
        <polygon points="60,86 49,105 71,105" fill="#ffffff" />
        {/* Lapel details */}
        <path d="M47 88 L57 116 L43 116 Z" fill="#1b172a" />
        <path d="M73 88 L63 116 L77 116 Z" fill="#1b172a" />
        {/* Silk Tie / Accent */}
        <polygon points="58,98 62,98 61,114 59,114" fill="#6c5ce7" />

        {/* Neck */}
        <rect
          x="54"
          y="66"
          width="12"
          height="22"
          rx="4"
          fill="url(#skinGrad)"
        />

        {/* Head */}
        <ellipse cx="60" cy="53" rx="20" ry="23" fill="url(#skinGrad)" />

        {/* Hair Back & Top */}
        <path
          d="M38 52 C38 31 46 22 60 22 C74 22 82 31 82 52 C78 36 70 30 60 30 C50 30 42 36 38 52 Z"
          fill="url(#hairGrad)"
        />
        <path
          d="M39 46 C42 34 50 28 62 28 C74 28 80 34 81 44 C76 38 68 34 58 36 C48 38 42 42 39 46 Z"
          fill="#4c3d35"
        />

        {/* Eyebrows */}
        <path
          d="M46 43 Q51 41 55 43"
          stroke="#251c17"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M65 43 Q69 41 74 43"
          stroke="#251c17"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
        />

        {/* Eyes (with subtle blink animation) */}
        <g className="avatar-eyes">
          <ellipse cx="50" cy="49" rx="2.8" ry="3.2" fill="#1e1814" />
          <circle cx="49" cy="47.8" r="1" fill="#ffffff" />
          <ellipse cx="70" cy="49" rx="2.8" ry="3.2" fill="#1e1814" />
          <circle cx="69" cy="47.8" r="1" fill="#ffffff" />
        </g>

        {/* Subtle Nose */}
        <path
          d="M59 52 Q60 56 62 56"
          stroke="#deaa96"
          strokeWidth="1.4"
          strokeLinecap="round"
          fill="none"
        />

        {/* Friendly Mouth / Speaking Mouth */}
        {isSpeaking ? (
          <ellipse
            cx="60"
            cy="63"
            rx="4.2"
            ry="3.2"
            fill="#a64444"
            className="avatar-speaking-mouth"
          />
        ) : (
          <path
            d="M54 62 Q60 67 66 62"
            stroke="#a64444"
            strokeWidth="1.8"
            strokeLinecap="round"
            fill="none"
          />
        )}

        {/* Sleek Communicator Earpiece / Headset */}
        <path
          d="M78 49 C81 49 82 53 81 57 L80 61 L74 65"
          stroke="#483d8b"
          strokeWidth="1.8"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="80" cy="53" r="3.2" fill="#322660" />
        {/* Headset Status LED */}
        <circle
          cx="80"
          cy="53"
          r="1.4"
          className="avatar-headset-led"
        />
      </svg>
    </div>
  )
}
