const LETTERS = ['A', 'B', 'C', 'D']

export default function ChoiceList({ choices, selected, onSelect, disabled, correctAnswer }) {
  if (!choices || choices.length === 0) return null

  return (
    <div className="space-y-2">
      {choices.map((choice, idx) => {
        const letter = choice.letter || choice.label || LETTERS[idx]
        const text = choice.text || choice.content || choice.value || choice
        const isSelected = selected === letter
        const isCorrect = correctAnswer && correctAnswer === letter
        const isWrong = correctAnswer && isSelected && !isCorrect

        let borderClass = 'border-neutral-200'
        let bgClass = 'bg-white'
        let ringClass = ''

        if (isCorrect && correctAnswer) {
          borderClass = 'border-green-400'
          bgClass = 'bg-green-50'
        } else if (isWrong) {
          borderClass = 'border-red-300'
          bgClass = 'bg-red-50'
        } else if (isSelected && !correctAnswer) {
          borderClass = 'border-[#2563eb]'
          bgClass = 'bg-blue-50'
          ringClass = 'ring-1 ring-[#2563eb]'
        }

        return (
          <button
            key={letter}
            onClick={() => !disabled && onSelect(letter)}
            disabled={disabled}
            className={`w-full text-left px-4 py-3 rounded-lg border ${borderClass} ${bgClass} ${ringClass} flex items-start gap-3 transition-all ${
              disabled ? 'cursor-default' : 'hover:border-neutral-400 cursor-pointer'
            }`}
          >
            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium shrink-0 mt-0.5 ${
              isSelected && !correctAnswer
                ? 'bg-[#2563eb] text-white'
                : isCorrect && correctAnswer
                  ? 'bg-green-500 text-white'
                  : isWrong
                    ? 'bg-red-400 text-white'
                    : 'bg-neutral-100 text-neutral-600'
            }`}>
              {letter}
            </span>
            <span className="text-sm text-[#111] leading-relaxed">
              {typeof text === 'string' ? text : JSON.stringify(text)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
