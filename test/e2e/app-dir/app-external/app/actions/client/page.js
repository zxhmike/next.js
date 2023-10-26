'use client'

import { log } from 'actions-pkg'

export default function Page() {
  return (
    <div>
      <form action={log}>
        <button type="submit">log</button>
      </form>
    </div>
  )
}
