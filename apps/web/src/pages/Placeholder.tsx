export default function Placeholder({ title, stage, blurb }: { title: string; stage: string; blurb: string }) {
  return (
    <>
      <h1>{title}</h1>
      <div className="empty">
        <p>{blurb}</p>
        {stage && <p className="muted">Not built yet. Planned for {stage} of the roadmap.</p>}
      </div>
    </>
  );
}
