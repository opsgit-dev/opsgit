import { GitHub, Mark } from "./Icons";

export const REPO = "https://github.com/opsgit-dev/opsgit";

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <a className="logo" href="#top" aria-label="opsgit home" style={{ fontSize: size }}>
      <Mark />
      opsgit
    </a>
  );
}

export function Nav() {
  return (
    <nav>
      <div className="wrap nav">
        <Logo />
        <div className="links">
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
          <a href="#packages">Packages</a>
          <a href="#security">Security</a>
          <a href="#pricing">Pricing</a>
        </div>
        <a className="btn btn-dark btn-sm" href={REPO}><GitHub />GitHub</a>
      </div>
    </nav>
  );
}

export function Footer() {
  return (
    <footer>
      <div className="wrap foot">
        <Logo size={18} />
        <div className="links">
          <a className="gh" href={REPO}><GitHub />GitHub</a>
          <a href="https://www.npmjs.com/package/opsgit-flags">npm</a>
          <a href={`${REPO}/blob/main/LICENSE.md`}>License</a>
          <a href={`${REPO}/tree/main/brand`}>Brand</a>
        </div>
        <span>© 2026 opsgit</span>
      </div>
    </footer>
  );
}
