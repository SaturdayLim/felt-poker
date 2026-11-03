/* A report opened from its link: fills the same template as the HTML file and shows it in the app. Download keeps the file. */
import { useEffect, useState } from 'react';
import { Empty, Header, Icon } from '../components/ui';
import { fetchReport } from '../live/reportLink';
import { fillTemplate, loadTemplate } from '../report/htmlReport';
import { shareFiles } from '../report/share';
import { slug } from '../report/csv';

export default function ReportLink({ id, reportKey }: { id: string; reportKey: string }) {
  const [state, setState] = useState<'load' | 'gone' | 'bad' | { html: string; title: string }>('load');
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [got, template] = await Promise.all([fetchReport(id, reportKey), loadTemplate()]);
        if (!live) return;
        setState(got ? { html: fillTemplate(template, got.report, got.title), title: got.title } : 'gone');
      } catch { if (live) setState('bad'); }
    })();
    return () => { live = false; };
  }, [id, reportKey]);

  if (state === 'load') return <div className="felt-page"><Header title="Report" /><div className="sat-stack" aria-label="Loading the report"><div className="felt-skel" style={{ height: 180 }} /><div className="felt-skel" style={{ height: 320 }} /></div></div>;
  if (state === 'gone') return <div className="felt-page"><Header title="Report" /><Empty title="This report link has expired">Ask the host to share the report again.</Empty></div>;
  if (state === 'bad') return <div className="felt-page"><Header title="Report" /><Empty title="Cannot open the report">Check the connection and the link, then try again.</Empty></div>;
  const download = () => shareFiles([new File([state.html], `${slug(state.title)}-report.html`, { type: 'text/html' })], `${state.title} report`);
  return (
    <div className="felt-report-view">
      <div className="felt-report-bar sat-glass-2">
        <b className="felt-ellipsis">{state.title}</b>
        <button className="sat-btn sat-btn--sm" onClick={download}><Icon name="download" size={16} /> Download</button>
      </div>
      <iframe title="Game report" srcDoc={state.html} />
    </div>
  );
}
