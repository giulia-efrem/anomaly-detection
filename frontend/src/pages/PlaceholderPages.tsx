import { Compass, Scale } from 'lucide-react'
import { Link } from 'react-router'
import { buttonClass } from '../ui/buttonClass'
import { PageHeader, Panel } from '../ui/Panel'
import { EmptyState } from '../ui/States'

export function ComparePage() {
  return (
    <>
      <PageHeader title="Compare models" description="Supervised and unsupervised detectors side by side on the same footage." />
      <div className="px-6 pb-8">
        <Panel>
          <EmptyState
            icon={Scale}
            title="Side-by-side comparison comes next"
            description="This page will show the pretrained and scene normality scores on the same clips, where they agree and where only one of them raised an alarm. Until then, the incident history shows which model raised each alarm."
            action={<Link to="/test-videos" className={buttonClass('secondary', 'sm')}>Prepare test videos</Link>}
          />
        </Panel>
      </div>
    </>
  )
}

export function NotFoundPage() {
  return (
    <div className="px-6 py-8">
      <Panel>
        <EmptyState
          icon={Compass}
          title="This page doesn't exist"
          action={<Link to="/" className={buttonClass('primary', 'sm')}>Go to Live</Link>}
        />
      </Panel>
    </div>
  )
}
