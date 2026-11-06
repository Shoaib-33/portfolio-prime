/* Splits a line of text into words, each inside its own mask, so headlines can rise word by word.
   Rendered by React (server or client), never by DOM surgery, so language switches keep working. */
import { Fragment } from 'react';

export function Split({ text, from = 0 }: { text: string; from?: number }) {
  return <>{text.split(' ').map((w, i) => <Fragment key={i}>{i > 0 && ' '}<span className="rg-sw"><span style={{ ['--w' as any]: from + i }}>{w}</span></span></Fragment>)}</>;
}
