import { describe, expect, it } from 'vitest';
import { documentBlob, isDocumentImage } from './photo';

const b64 = (text: string) => Buffer.from(text).toString('base64');

describe('documentBlob', () => {
  it('opens a real PDF as a PDF', async () => {
    const blob = documentBlob(`data:application/pdf;base64,${b64('%PDF-1.7 hello')}`, 'application/pdf');
    expect(blob?.type).toBe('application/pdf');
    expect(await blob?.text()).toBe('%PDF-1.7 hello');
  });

  it('refuses a "PDF" whose data is really a web page', () => {
    // What a hostile academy owner would store: the column says PDF, the data says HTML.
    const page = `data:text/html;base64,${b64('<script>alert(localStorage)</script>')}`;
    expect(documentBlob(page, 'application/pdf')).toBeNull();
  });

  it('never takes the type from the data, even with extra parameters', () => {
    expect(documentBlob(`data:application/pdf;charset=x;base64,${b64('x')}`, 'application/pdf')).toBeNull();
    expect(documentBlob(`data:image/svg+xml;base64,${b64('<svg/>')}`, 'image/png')).toBeNull();
  });

  it('refuses a type the database would never hold', () => {
    const html = `data:text/html;base64,${b64('<p>')}`;
    expect(documentBlob(html, 'text/html' as never)).toBeNull();
  });

  it('refuses data that is not base64', () => {
    expect(documentBlob('data:application/pdf;base64,***', 'application/pdf')).toBeNull();
  });
});

describe('isDocumentImage', () => {
  it('previews only pictures that are what they say', () => {
    expect(isDocumentImage(`data:image/jpeg;base64,${b64('x')}`, 'image/jpeg')).toBe(true);
    expect(isDocumentImage(`data:image/svg+xml;base64,${b64('<svg/>')}`, 'image/jpeg')).toBe(false);
    expect(isDocumentImage(`data:application/pdf;base64,${b64('x')}`, 'application/pdf')).toBe(false);
  });
});
