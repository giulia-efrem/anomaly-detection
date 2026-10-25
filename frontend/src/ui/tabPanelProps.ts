export function tabPanelProps(idBase: string, value: string) {
  return { role: 'tabpanel', id: `${idBase}-panel`, 'aria-labelledby': `${idBase}-tab-${value}` } as const
}
