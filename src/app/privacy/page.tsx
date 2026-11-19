export const metadata = { title: "Privacy Policy — Chess Quest" };

export default function Privacy() {
  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-4 text-sm leading-relaxed">
      <h1 className="text-2xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="text-mute">Effective 19 November 2026</p>
      <p>Chess Quest does not collect, transmit or sell personal data.</p>
      <h2 className="mt-2 text-lg font-semibold">What stays on your device</h2>
      <p>Everything you create in Chess Quest is stored only on the device or browser you use: the exercises you import, your solving history, your review schedule, your profile details and your settings. None of it is sent to us or to anyone else. There are no accounts, no analytics, no advertising and no tracking.</p>
      <h2 className="mt-2 text-lg font-semibold">Files you import</h2>
      <p>When you import an exercise file, it is read on your device and kept in the app&apos;s local storage. It is never uploaded.</p>
      <h2 className="mt-2 text-lg font-semibold">Partner links</h2>
      <p>If you choose to share a partner session, the position and the notes you typed are encoded inside the link itself. The link is only as private as the way you send it. Nothing is stored on a server.</p>
      <h2 className="mt-2 text-lg font-semibold">Deleting your data</h2>
      <p>Use “Reset progress” in Profile and “Remove” in Import, or delete the app or clear the site&apos;s data in your browser. That removes everything.</p>
      <h2 className="mt-2 text-lg font-semibold">Changes</h2>
      <p>If this policy changes, the new version will be posted on this page with a new effective date.</p>
    </article>
  );
}
