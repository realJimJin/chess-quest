/* eslint-disable @next/next/no-img-element */
export default function CourseCover({ title, author, original = false }: { title: string; author: string; original?: boolean }) {
  if (original) return <img className="course-cover" src="/art/figma-make/starter-cover.svg" width="240" height="324" alt="The Starter Collection by Chess Quest" />;
  return <div className="course-cover cover-imported" aria-hidden="true"><span className="cover-imprint">YOUR CHESS LIBRARY</span><strong>{title}</strong><span className="cover-author">{author}</span><span className="cover-bottom">PRIVATE COLLECTION</span></div>;
}
