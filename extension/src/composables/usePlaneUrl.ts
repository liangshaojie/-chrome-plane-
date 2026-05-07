import { computed } from 'vue'
import { useChromeTabs } from './useChromeTabs'

export interface ParsedPlaneUrl {
  workspaceSlug: string
  issueIdentifier: string
}

export function usePlaneUrl() {
  const { currentTabUrl } = useChromeTabs()

  function parsePlaneUrl(url: string | null): ParsedPlaneUrl | null {
    if (!url) return null
    try {
      const u = new URL(url)
      if (!u.hostname.endsWith('plane.so') && !u.hostname.endsWith('max-optics.com')) return null
      const parts = u.pathname.split('/').filter(Boolean)
      const browseIdx = parts.indexOf('browse')
      if (browseIdx < 1 || browseIdx + 1 >= parts.length) return null
      const workspaceSlug = parts[browseIdx - 1]
      const ident = parts[browseIdx + 1]
      if (!/^[A-Za-z0-9]+-\d+$/.test(ident)) return null
      return { workspaceSlug, issueIdentifier: ident.toUpperCase() }
    } catch {
      return null
    }
  }

  const parsedUrl = computed(() => parsePlaneUrl(currentTabUrl.value))
  const metaText = computed(() => {
    if (!parsedUrl.value) return '未识别 Plane 链接（请打开 Plane 的 workItem 页面）'
    return `${parsedUrl.value.workspaceSlug} / ${parsedUrl.value.issueIdentifier}`
  })

  return { parsedUrl, metaText, currentTabUrl }
}
