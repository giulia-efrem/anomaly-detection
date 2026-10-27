import { Link } from 'react-router'
import { buttonClass } from '../ui/buttonClass'
import { Panel } from '../ui/Panel'
import { EmptyState } from '../ui/States'

/** Behind FEATURE_COMPARE (src/features.ts); not routed while the flag is off. */
export function ComparePage() {
  return (
    <div className="p-4">
      <Panel>
        <EmptyState
          title="Model comparison is not available yet"
          description="This page will show the supervised and unsupervised scores on the same clips and where only one of them raised an alarm."
          action={<Link to="/incidents" className={buttonClass('secondary', 'sm')}>Open incidents</Link>}
        />
      </Panel>
    </div>
  )
}

export function NotFoundPage() {
  return (
    <div className="p-4">
      <Panel>
        <EmptyState
          title="This page does not exist"
          action={<Link to="/" className={buttonClass('secondary', 'sm')}>Go to Live</Link>}
        />
      </Panel>
    </div>
  )
}
