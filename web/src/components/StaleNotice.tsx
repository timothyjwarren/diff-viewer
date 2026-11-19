/** Says files changed on disk after they were loaded, with a button to reload them. */
export function StaleNotice({ onReload }: { onReload: () => void }) {
  return (
    <div role="status" className="stale-notice">
      Changed since you loaded it
      <button type="button" className="btn" onClick={onReload}>Reload</button>
    </div>
  );
}
