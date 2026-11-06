'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { IconTrash as Trash2 } from '@tabler/icons-react'
import { toast } from 'sonner'

import { deleteAccount } from '@/lib/actions/account'
import { signOut } from '@/lib/actions/auth'
import { chatStore } from '@/lib/chat-store'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

export function DeleteAccountButton({
  appearance = 'button'
}: {
  appearance?: 'button' | 'menu'
} = {}) {
  const router = useRouter()
  const [isDeleting, startTransition] = useTransition()

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteAccount()

      if (result.success) {
        chatStore.setUser(null)
        try {
          await signOut()
        } catch (error) {
          console.error('Failed to clear client session:', error)
        }

        toast.success('Account deleted')
        router.push('/')
        router.refresh()
        return
      }

      toast.error(result.error ?? 'Failed to delete account')
    })
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {appearance === 'menu' ? (
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start gap-2 px-2 text-destructive hover:text-destructive"
          >
            <Trash2 className="size-4" />
            Delete account
          </Button>
        ) : (
          <Button type="button" variant="destructive" className="gap-2">
            <Trash2 className="size-4" />
            Delete account
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. Your account, chat history, and
            uploaded files will be permanently deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isDeleting}
            onClick={event => {
              event.preventDefault()
              handleDelete()
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? <Spinner /> : 'Delete account'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
