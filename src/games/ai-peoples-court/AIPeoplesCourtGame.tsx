import GameAppShell from "@/components/react/GameAppShell";
import Icon from "@/components/react/Icon";

export default function AIPeoplesCourtGame() {
  return (
    <GameAppShell
      gameTitle="AI People’s Court"
      className="peoples-court"
      backLabel="All games"
    >
      <main className="courtroom-backdrop flex h-full min-h-0 overflow-y-auto px-4 py-8 sm:px-6 sm:py-12">
        <section className="courtroom-card m-auto w-full max-w-2xl overflow-hidden rounded-2xl border">
          <div className="courtroom-rail h-2" aria-hidden="true" />
          <div className="px-5 py-8 text-center sm:px-10 sm:py-12">
            <div
              className="courtroom-seal mx-auto flex h-20 w-20 items-center justify-center rounded-full border sm:h-24 sm:w-24"
              aria-hidden="true"
            >
              <Icon name="hammer" className="h-9 w-9 sm:h-11 sm:w-11" />
            </div>

            <p className="courtroom-kicker mt-6 text-xs font-bold tracking-[0.22em] uppercase">
              Phase 1 · Under construction
            </p>
            <h1 className="courtroom-heading mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              The courtroom is not in session yet
            </h1>
            <p className="courtroom-copy mx-auto mt-4 max-w-xl text-sm leading-7 sm:text-base">
              AI People’s Court now has its permanent place in the Games portal.
              Case generation, courtroom procedure, and local-model play will
              arrive in a later phase.
            </p>
            <p className="courtroom-note mx-auto mt-4 max-w-lg text-sm">
              No cases are available during this architecture-only preview.
            </p>

            <a
              href="/"
              className="courtroom-home mt-8 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors"
            >
              <Icon name="home" className="h-4 w-4" />
              Return to all games
            </a>
          </div>
        </section>
      </main>
    </GameAppShell>
  );
}
