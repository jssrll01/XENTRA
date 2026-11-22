import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export default function Field({ icon: Icon, label, required, error, type = 'text', ...rest }) {
  const [show, setShow] = useState(false);
  const pw = type === 'password';
  return (
    <>
      <div className={'field' + (error ? ' has-error' : '')}>
        {Icon ? <span className="field-icon"><Icon size={20} /></span> : null}
        <label className="field-body">
          <span className="field-label">{label}{required ? <b>*</b> : null}</span>
          <input type={pw && show ? 'text' : type} aria-invalid={error ? 'true' : undefined} {...rest} />
        </label>
        {pw ? (
          <button type="button" className="field-eye" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>
            {show ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        ) : null}
      </div>
      {error ? <div className="field-error" role="alert">{error}</div> : null}
    </>
  );
}
