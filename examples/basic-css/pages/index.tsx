import styles from '../styles.module.css'
import { a } from './test'

const Home = () => {
  a()
  return (
    <div className={styles.hello}>
      <p>Hello World3</p>
    </div>
  )
}

export default Home
