import QuestIcon from "./QuestIcon";
export default function CourseCover({ title, author, original = false }: { title: string; author: string; original?: boolean }) {
  return <div className={`course-cover ${original ? "cover-original" : "cover-imported"}`} aria-hidden="true">
    <div className="cover-rule" /><div className="cover-imprint">{original ? "CHESS QUEST ORIGINALS" : "YOUR CHESS LIBRARY"}</div>
    <div className="cover-emblem"><div /><QuestIcon name="knight" /><div /></div>
    <div className="cover-title">{original ? <>The Starter<br />Collection</> : title}</div>
    <div className="cover-subtitle">{original ? "A STUDY IN CHECKMATE" : author}</div>
    <div className="cover-bottom">{original ? "EIGHT ORIGINAL POSITIONS" : "PERSONAL EDITION"}<span>◆</span></div>
  </div>;
}
