import { describe, it, expect } from 'vitest';
import { acceptRevisions } from '../src/core/parser.js';

describe('acceptRevisions', () => {
  it('removes deleted text', () => {
    const xml = `<w:p><w:r><w:t>Hello </w:t></w:r><w:del w:id="1" w:author="A"><w:r><w:t>old </w:t></w:r></w:del><w:r><w:t>world</w:t></w:r></w:p>`;
    const result = acceptRevisions(xml);
    expect(result).not.toContain('old');
    expect(result).toContain('Hello');
    expect(result).toContain('world');
  });

  it('unwraps inserted text', () => {
    const xml = `<w:p><w:r><w:t>Hello </w:t></w:r><w:ins w:id="2" w:author="A"><w:r><w:t>new </w:t></w:r></w:ins><w:r><w:t>world</w:t></w:r></w:p>`;
    const result = acceptRevisions(xml);
    expect(result).not.toContain('<w:ins');
    expect(result).not.toContain('</w:ins>');
    expect(result).toContain('<w:r><w:t>new </w:t></w:r>');
  });

  it('removes moveFrom and unwraps moveTo', () => {
    const xml = `<w:moveFrom w:id="3"><w:r><w:t>moved</w:t></w:r></w:moveFrom><w:moveTo w:id="4"><w:r><w:t>moved</w:t></w:r></w:moveTo>`;
    const result = acceptRevisions(xml);
    expect(result).not.toContain('<w:moveFrom');
    expect(result).not.toContain('<w:moveTo');
    // moveTo content is kept
    expect(result).toContain('<w:r><w:t>moved</w:t></w:r>');
  });

  it('removes rPrChange metadata', () => {
    const xml = `<w:rPr><w:b/><w:rPrChange w:id="5"><w:rPr><w:i/></w:rPr></w:rPrChange></w:rPr>`;
    const result = acceptRevisions(xml);
    expect(result).toContain('<w:b/>');
    expect(result).not.toContain('<w:rPrChange');
    expect(result).not.toContain('<w:i/>');
  });

  it('removes pPrChange metadata', () => {
    const xml = `<w:pPr><w:jc w:val="center"/><w:pPrChange w:id="6"><w:pPr><w:jc w:val="left"/></w:pPr></w:pPrChange></w:pPr>`;
    const result = acceptRevisions(xml);
    expect(result).toContain('w:val="center"');
    expect(result).not.toContain('<w:pPrChange');
  });

  it('passes through XML without revisions unchanged', () => {
    const xml = `<w:p><w:r><w:t>Normal text</w:t></w:r></w:p>`;
    expect(acceptRevisions(xml)).toBe(xml);
  });

  it('handles multiple revisions in sequence', () => {
    const xml = `<w:p><w:del w:id="1"><w:r><w:t>A</w:t></w:r></w:del><w:ins w:id="2"><w:r><w:t>B</w:t></w:r></w:ins><w:del w:id="3"><w:r><w:t>C</w:t></w:r></w:del></w:p>`;
    const result = acceptRevisions(xml);
    expect(result).not.toContain('>A<');
    expect(result).toContain('>B<');
    expect(result).not.toContain('>C<');
  });
});
