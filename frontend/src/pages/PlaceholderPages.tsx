import { Compass, GraduationCap, Scale } from 'lucide-react'
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
            title="Comparison arrives with detection"
            description="Once both detectors run (step 3), this page shows their scores on the same clips, where they agree and where only one of them raised an alarm."
            action={<Link to="/test-videos" className={buttonClass('secondary', 'sm')}>Prepare test videos</Link>}
          />
        </Panel>
      </div>
    </>
  )
}

export function TrainingPage() {
  return (
    <>
      <PageHeader title="Training" description="Per-camera learning for the unsupervised model and labelled runs for the supervised one." />
      <div className="px-6 pb-8">
        <Panel>
          <EmptyState
            icon={GraduationCap}
            title="Nothing to train yet"
            description="Confirmed incidents and false alarms you review become training data. Training runs will be started and tracked here."
            action={<Link to="/incidents" className={buttonClass('secondary', 'sm')}>Review incidents</Link>}
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
