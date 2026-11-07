import { FeltMark, Icon } from '../components/ui';

/** The first view when Felt opens: host a game on this phone, or join one as a player (the camera scanner).
    The two choices skip the app press handler (data-press="none"): they only dim on press, so they do not move. */
export default function Start({ onHost, onPlayer }: { onHost: () => void; onPlayer: () => void }) {
  return (
    <div className="felt-page felt-start-view">
      <div className="felt-start-mark"><FeltMark height={64} full /><span className="sat-wordmark">Felt</span></div>
      <div className="felt-start-choices">
        <button type="button" className="felt-start-choice" data-press="none" onClick={onHost}>
          <Icon name="cards" size={28} />
          <b>Host</b>
          <span className="sat-small sat-muted">Run the game and log hands on this phone.</span>
        </button>
        <button type="button" className="felt-start-choice" data-press="none" onClick={onPlayer}>
          <Icon name="qr" size={28} />
          <b>Player</b>
          <span className="sat-small sat-muted">Scan the QR code to follow the action and log your hands.</span>
        </button>
      </div>
    </div>
  );
}
