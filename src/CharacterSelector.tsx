import { useRef } from 'react';
import { CHARACTER_STYLES, getStyle, splitCharacters, styleCount, validateCustom, type StyleId } from './core/styles';
import { fontLicenseUrl } from './fonts';

interface Props {
  value: StyleId;
  custom: string;
  onSelect: (style: StyleId) => void;
  onCustom: (text: string) => void;
}
const visible = (text: string) => text.replaceAll(' ', '␠');

export default function CharacterSelector({ value, custom, onSelect, onCustom }: Props) {
  const details = useRef<HTMLDetailsElement>(null);
  const style = getStyle(value);
  const validation = validateCustom(custom);
  return <div className="character-selector">
    <details ref={details} onKeyDown={event => { if (event.key === 'Escape' && details.current) { details.current.open = false; details.current.querySelector('summary')?.focus(); } }}>
      <summary aria-label="Seleccionar estilo de caracteres" data-testid="selected-style" data-style={value}>
        <span>Caracteres · {style.name}</span><small>{styleCount(style, custom)} {style.kind === 'braille' ? 'patrones' : 'caracteres'} · abrir ▾</small>
        <code>{visible(style.kind === 'custom' ? custom : style.characters)}</code>
      </summary>
      <fieldset className="character-options"><legend className="sr-only">Conjuntos de caracteres</legend>
        {CHARACTER_STYLES.map(option => <label className="character-option" key={option.id}>
          <input type="radio" name="character-style" aria-label={option.name} value={option.id} checked={value === option.id} onChange={() => {
            onSelect(option.id);
            if (details.current) { details.current.open = false; details.current.querySelector('summary')?.focus(); }
          }} />
          <span><strong>{option.name} <small>{styleCount(option, custom)}</small></strong><code>{visible(option.kind === 'custom' ? custom : option.characters)}</code><small>{option.description}</small></span>
        </label>)}
      </fieldset>
    </details>
    {value === 'custom' && <div className="custom-characters">
      <label className="control">Secuencia personalizada<textarea aria-label="Secuencia personalizada" value={custom} maxLength={2048} rows={3} spellCheck={false} aria-invalid={!!validation.error} aria-describedby="custom-help custom-error" onChange={event => onCustom(event.target.value)} /></label>
      <p id="custom-help">De oscuro a claro. ␠ representa un espacio en la vista previa. Unicode: {splitCharacters(custom).length} caracteres.</p>
      <button disabled={!!validation.error} onClick={() => onCustom([...validation.characters].reverse().join(''))}>Invertir orden</button>
      <p id="custom-error" role={validation.error ? 'alert' : undefined}>{validation.error || 'Secuencia válida. La preview utiliza el orden escrito.'}</p>
    </div>}
    <a className="font-license" href={fontLicenseUrl} download="DejaVu-LICENSE.txt">Tipografía Unicode local · licencia DejaVu</a>
  </div>;
}
