import { FeltMark, Icon } from '../components/ui';

/** The first view when Felt opens: host a game on this phone, or join one as a player (the camera scanner). */
export default function Start({ onHost, onPlayer }: { onHost: () => void; onPlayer: () => void }) {
  return (
    <div className="felt-page felt-start-view">
      <div className="felt-start-mark"><FeltMark height={64} /><span className="sat-wordmark">Felt</span></div>
      <div className="felt-start-choices">
        <button type="button" className="sat-glass-2 felt-start-choice" onClick={onHost}>
          <Icon name="cards" size={28} />
          <b>Host</b>
          <span className="sat-small sat-muted">Run the game and log the hands on this phone.</span>
        </button>
        <button type="button" className="sat-glass-2 felt-start-choice" onClick={onPlayer}>
          <Icon name="qr" size={28} />
          <b>Player</b>
          <span className="sat-small sat-muted">Scan the host's QR to follow the game and send your cards.</span>
        </button>
      </div>
    </div>
  );
}
